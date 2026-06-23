import * as Y from "yjs";
import { apply, batch, isNoop, type Patch, type Scene } from "@oh-just-another/scene";
import type { HistoryProvider, TransactionHandle } from "@oh-just-another/history";
import type { SceneDoc } from "./scene-doc.js";
import { diffMapInto } from "./diff-map.js";

/**
 * CRDT-aware history backend backed by `Y.UndoManager`.
 *
 * In a collaborative session, the linear `History` from
 * `@oh-just-another/history` undoes *any* recent change, including a
 * peer's. `CollabHistory` scopes undo to the local client by tagging
 * every locally-pushed Yjs transaction with a shared origin and
 * tracking only that origin in the underlying `Y.UndoManager`.
 *
 * Wiring (the host's job):
 *
 *   const sceneDoc = new SceneDoc();
 *   const history = new CollabHistory(sceneDoc);
 *   const editor = new Editor({ ..., history });
 *   bindEditor(editor, sceneDoc);
 *
 * The provider also keeps a small parallel scene mirror (`getScene`
 * callback the host hands in or — by default — wrapped against
 * `sceneDoc.snapshot()`) so it can compute the inverse of every
 * pushed patch in CRDT-land. That inverse is what gets applied
 * remotely through the same `applyDelta` machinery `bindEditor`
 * already uses, so peers receive a single coalesced patch per
 * undo step.
 */

export interface CollabHistoryOptions {
  /**
   * Number of undo steps to keep on the stack. Mirrors the linear
   * `History.limit`. Default: governed by `Y.UndoManager` defaults.
   */
  readonly captureLimit?: number;
  /**
   * Y.UndoManager `captureTimeout` — coalesces multiple Yjs
   * transactions in this window into one undo step. Default 0
   * (one editor mutation = one undo step). Set to e.g. 500 to
   * group "typing in a row" type input.
   */
  readonly captureTimeout?: number;
}

export class CollabHistory implements HistoryProvider {
  private readonly doc: Y.Doc;
  private readonly origin: symbol;
  private readonly maps: readonly [Y.Map<unknown>, Y.Map<unknown>, Y.Map<unknown>, Y.Map<unknown>];
  private readonly viewportMap: Y.Map<unknown>;
  private readonly undoManager: Y.UndoManager;

  // Snapshot mirror used to compute patch inverses.
  private readonly snapshot: () => Scene;
  private current: Scene;

  constructor(sceneDoc: SceneDoc, options: CollabHistoryOptions = {}) {
    this.doc = sceneDoc.doc;
    this.origin = Symbol("yjs-history");
    this.maps = [
      sceneDoc.elements as unknown as Y.Map<unknown>,
      sceneDoc.links as unknown as Y.Map<unknown>,
      sceneDoc.layers as unknown as Y.Map<unknown>,
      sceneDoc.annotations as unknown as Y.Map<unknown>,
    ];
    this.viewportMap = sceneDoc.viewport;
    this.snapshot = () => sceneDoc.snapshot();
    this.current = this.snapshot();

    const tracked = [...this.maps, this.viewportMap] as unknown as Y.AbstractType<unknown>[];
    this.undoManager = new Y.UndoManager(tracked, {
      trackedOrigins: new Set([this.origin]),
      captureTimeout: options.captureTimeout ?? 0,
    });

    if (options.captureLimit !== undefined) {
      // Y.UndoManager doesn't expose `limit` post-construction; the
      // host constructs a fresh provider when they need a new cap.
      // The option is best-effort for parity with `HistoryOptions`.
      void options.captureLimit;
    }

    // Keep the mirror in sync with every doc transaction (local or
    // remote). Without this, a remote-coming change would leave
    // `this.current` stale and the next push() would compute the
    // inverse against a wrong scene.
    this.doc.on("afterTransaction", () => {
      this.current = this.snapshot();
    });
  }

  push(p: Patch): void {
    if (isNoop(p)) return;
    // Apply the patch to the doc inside a tracked transaction so
    // the UndoManager records it. The doc itself is the source of
    // truth — the editor calls push() after already mutating its
    // local scene; we need to mirror that mutation into the CRDT.
    this.doc.transact(() => {
      this.applyToCrdt(p);
    }, this.origin);
    this.current = this.snapshot();
  }

  undo(): Patch | null {
    const before = this.current;
    const stackEntry = this.undoManager.undo();
    if (!stackEntry) return null;
    const after = this.snapshot();
    this.current = after;
    return diffAsPatch(before, after);
  }

  redo(): Patch | null {
    const before = this.current;
    const stackEntry = this.undoManager.redo();
    if (!stackEntry) return null;
    const after = this.snapshot();
    this.current = after;
    return diffAsPatch(before, after);
  }

  clear(): void {
    this.undoManager.clear();
  }

  transaction(): TransactionHandle {
    const buffer: Patch[] = [];
    let open = true;
    return {
      add: (p: Patch) => {
        if (!open) throw new Error("Transaction is no longer open");
        if (!isNoop(p)) buffer.push(p);
      },
      commit: () => {
        if (!open) return;
        open = false;
        if (buffer.length === 0) return;
        this.doc.transact(() => {
          for (const p of buffer) this.applyToCrdt(p);
        }, this.origin);
        this.current = this.snapshot();
      },
      cancel: () => {
        open = false;
      },
      isOpen: () => open,
    };
  }

  get canUndo(): boolean {
    return this.undoManager.canUndo();
  }
  get canRedo(): boolean {
    return this.undoManager.canRedo();
  }
  get size(): number {
    // Yjs's UndoManager exposes `undoStack` length as a stand-in
    // for "how many undo steps available". Useful for counter UIs.
    return this.undoManager.undoStack.length;
  }

  /**
   * Mirror a scene patch into the CRDT. The kernel's `apply(scene,
   * patch)` writes to a fresh Scene; the equivalent on the Y.Map
   * side applies the patch to the local mirror, then replaces the
   * divergent maps with the new values inside the tracked transaction.
   */
  private applyToCrdt(p: Patch): void {
    const before = this.current;
    const after = apply(before, p);
    diffMapInto<unknown>(before.elements, after.elements, this.maps[0]);
    diffMapInto<unknown>(before.links, after.links, this.maps[1]);
    diffMapInto<unknown>(before.layers, after.layers, this.maps[2]);
    diffMapInto<unknown>(before.annotations, after.annotations, this.maps[3]);
    if (before.viewport !== after.viewport) {
      this.viewportMap.set("current", after.viewport);
    }
    this.current = after;
  }
}

/**
 * Produce a minimal patch describing the difference between two
 * scenes. Used after Y.UndoManager rewinds the CRDT so the Editor
 * can apply the corresponding patch to its local scene mirror.
 *
 * Structural: every shape/edge/layer/annotation present-or-absent
 * on each side gets a single add/remove/update op. A rewind that
 * landed on the same state resolves to a `null` return — the caller
 * skips applying.
 */
const diffAsPatch = (before: Scene, after: Scene): Patch | null => {
  const ops: Patch[] = [];

  for (const [id, prev] of before.elements) {
    const next = after.elements.get(id);
    if (next === undefined) ops.push({ kind: "element", id, before: prev, after: null });
    else if (next !== prev) ops.push({ kind: "element", id, before: prev, after: next });
  }
  for (const [id, next] of after.elements) {
    if (!before.elements.has(id)) ops.push({ kind: "element", id, before: null, after: next });
  }

  for (const [id, prev] of before.links) {
    const next = after.links.get(id);
    if (next === undefined) ops.push({ kind: "link", id, before: prev, after: null });
    else if (next !== prev) ops.push({ kind: "link", id, before: prev, after: next });
  }
  for (const [id, next] of after.links) {
    if (!before.links.has(id)) ops.push({ kind: "link", id, before: null, after: next });
  }

  for (const [id, prev] of before.layers) {
    const next = after.layers.get(id);
    if (next === undefined) ops.push({ kind: "layer", id, before: prev, after: null });
    else if (next !== prev) ops.push({ kind: "layer", id, before: prev, after: next });
  }
  for (const [id, next] of after.layers) {
    if (!before.layers.has(id)) ops.push({ kind: "layer", id, before: null, after: next });
  }

  for (const [id, prev] of before.annotations) {
    const next = after.annotations.get(id);
    if (next === undefined) ops.push({ kind: "annotation", id, before: prev, after: null });
    else if (next !== prev) ops.push({ kind: "annotation", id, before: prev, after: next });
  }
  for (const [id, next] of after.annotations) {
    if (!before.annotations.has(id))
      ops.push({ kind: "annotation", id, before: null, after: next });
  }

  if (before.viewport !== after.viewport) {
    ops.push({ kind: "viewport", before: before.viewport, after: after.viewport });
  }

  if (ops.length === 0) return null;
  const first = ops[0];
  if (ops.length === 1 && first !== undefined) return first;
  return batch(ops);
};
