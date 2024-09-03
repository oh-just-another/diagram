import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { shapeId } from "@oh-just-another/types";
import {
  addShape,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Shape,
} from "@oh-just-another/scene";
import type { PeerCursor, PeerSelection } from "@oh-just-another/state";
import { CollabAwareness } from "../src/awareness";
import { bindAwareness } from "../src/bind-awareness";

/**
 * Editor stub — implements only the slice of the API `bindAwareness`
 * uses, so the test can run in a `node` environment without DOM.
 */
const makeStubEditor = (scene: Scene) => {
  const sceneListeners = new Set<() => void>();
  const cursorListeners = new Set<(p: { x: number; y: number }) => void>();
  let peerCursors: readonly PeerCursor[] = [];
  let peerSelections: readonly PeerSelection[] = [];
  return {
    scene,
    selection: new Set<string>(),
    subscribe: (fn: () => void) => {
      sceneListeners.add(fn);
      return () => sceneListeners.delete(fn);
    },
    onCursorMove: (fn: (p: { x: number; y: number }) => void) => {
      cursorListeners.add(fn);
      return () => cursorListeners.delete(fn);
    },
    setPeerCursors: (c: readonly PeerCursor[]) => {
      peerCursors = c;
    },
    setPeerSelections: (s: readonly PeerSelection[]) => {
      peerSelections = s;
    },
    // Test helpers
    get peerCursors() {
      return peerCursors;
    },
    get peerSelections() {
      return peerSelections;
    },
    emitCursorMove(p: { x: number; y: number }) {
      for (const fn of cursorListeners) fn(p);
    },
    setSelection(ids: readonly string[]) {
      this.selection = new Set(ids);
      for (const fn of sceneListeners) fn();
    },
  };
};

const rect = (id: string, x: number, y: number): Shape => ({
  id: shapeId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 40,
  height: 30,
});

interface AwarenessChange {
  added: number[];
  updated: number[];
  removed: number[];
}

const wireAwareness = (a: CollabAwareness, b: CollabAwareness): void => {
  a.awareness.on("update", (changes: AwarenessChange, origin: unknown) => {
    if (origin === "remote") return;
    const upd = encodeAwarenessUpdate(a.awareness, [
      ...changes.added,
      ...changes.updated,
      ...changes.removed,
    ]);
    applyAwarenessUpdate(b.awareness, upd, "remote");
  });
  b.awareness.on("update", (changes: AwarenessChange, origin: unknown) => {
    if (origin === "remote") return;
    const upd = encodeAwarenessUpdate(b.awareness, [
      ...changes.added,
      ...changes.updated,
      ...changes.removed,
    ]);
    applyAwarenessUpdate(a.awareness, upd, "remote");
  });
};

describe("bindAwareness", () => {
  it("publishes local user and broadcasts cursor moves", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const awA = new CollabAwareness(docA);
    const awB = new CollabAwareness(docB);
    wireAwareness(awA, awB);

    const { scene } = addShape(emptyScene(), rect("a", 0, 0));
    const editor = makeStubEditor(scene);
    const unbind = bindAwareness(editor as never, awA, {
      user: { id: "u1", name: "Alice", color: "#f00" },
      cursorThrottleMs: 0,
    });

    editor.emitCursorMove({ x: 100, y: 50 });
    // Throttle 0 → immediate publish.
    const peers = awB.getPeers();
    expect(peers.some((p) => p.user.name === "Alice" && p.cursor?.x === 100)).toBe(true);

    unbind();
    awA.destroy();
    awB.destroy();
    docA.destroy();
    docB.destroy();
  });

  it("renders peer cursors and selections into the editor", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const awA = new CollabAwareness(docA);
    const awB = new CollabAwareness(docB);
    wireAwareness(awA, awB);

    const { scene } = addShape(emptyScene(), rect("a", 10, 20));
    const editor = makeStubEditor(scene);
    const unbind = bindAwareness(editor as never, awA, {
      user: { id: "u1", name: "Alice", color: "#f00" },
    });

    // Peer B publishes user + cursor + selection.
    awB.updateLocal({
      user: { id: "u2", name: "Bob", color: "#0f0" },
      cursor: { x: 200, y: 100 },
      selection: ["a"],
    });

    expect(editor.peerCursors).toHaveLength(1);
    expect(editor.peerCursors[0]?.name).toBe("Bob");
    expect(editor.peerCursors[0]?.position).toEqual({ x: 200, y: 100 });
    expect(editor.peerSelections).toHaveLength(1);
    expect(editor.peerSelections[0]?.color).toBe("#0f0");
    expect(editor.peerSelections[0]?.bounds).toHaveLength(1);

    unbind();
    awA.destroy();
    awB.destroy();
    docA.destroy();
    docB.destroy();
  });

  it("clears peer state on unbind", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const awA = new CollabAwareness(docA);
    const awB = new CollabAwareness(docB);
    wireAwareness(awA, awB);

    const { scene } = addShape(emptyScene(), rect("a", 0, 0));
    const editor = makeStubEditor(scene);
    const unbind = bindAwareness(editor as never, awA, {
      user: { id: "u1", name: "Alice", color: "#f00" },
    });
    awB.updateLocal({
      user: { id: "u2", name: "Bob", color: "#0f0" },
      cursor: { x: 10, y: 10 },
    });
    expect(editor.peerCursors).toHaveLength(1);

    unbind();
    expect(editor.peerCursors).toHaveLength(0);
    expect(editor.peerSelections).toHaveLength(0);

    awA.destroy();
    awB.destroy();
    docA.destroy();
    docB.destroy();
  });

  it("publishes local selection changes into awareness", () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const awA = new CollabAwareness(docA);
    const awB = new CollabAwareness(docB);
    wireAwareness(awA, awB);

    const { scene } = addShape(emptyScene(), rect("a", 0, 0));
    const editor = makeStubEditor(scene);
    const unbind = bindAwareness(editor as never, awA, {
      user: { id: "u1", name: "Alice", color: "#f00" },
    });

    editor.setSelection(["a"]);
    const peer = awB.getPeers().find((p) => p.user.name === "Alice");
    expect(peer?.selection).toEqual(["a"]);

    unbind();
    awA.destroy();
    awB.destroy();
    docA.destroy();
    docB.destroy();
  });
});
