import type { AnnotationId, LinkId, LayerId, ElementId } from "@oh-just-another/types";
import type {
  Annotation,
  Link,
  Layer,
  Patch,
  Scene,
  Element,
} from "@oh-just-another/scene";
import { apply } from "@oh-just-another/scene";
import type { Snapshot, VersionId } from "./types.js";
import type { SnapshotStore } from "./store.js";

/**
 * One conflicting item produced by `threeWayMerge`. Both `source` and
 * `target` mutated the same id (or one mutated while the other deleted),
 * so the merger cannot auto-resolve. UI surfaces these to the user, who
 * picks one side or supplies its own resolution via `resolve`.
 */
export type ConflictResolution = "source" | "target" | "both";

export interface Conflict<Id, V> {
  readonly kind: "element" | "link" | "layer" | "annotation";
  readonly id: Id;
  readonly base: V | null;
  readonly source: V | null;
  readonly target: V | null;
}

export type SceneConflict =
  | Conflict<ElementId, Element>
  | Conflict<LinkId, Link>
  | Conflict<LayerId, Layer>
  | Conflict<AnnotationId, Annotation>;

export interface MergeReport {
  /** Auto-applied patches that landed on `target` without conflict. */
  readonly applied: readonly Patch[];
  /** Items requiring user resolution. */
  readonly conflicts: readonly SceneConflict[];
  /** Resulting scene after auto-merge (conflicts left as `target` values). */
  readonly mergedScene: Scene;
}

/**
 * Common ancestor of two snapshot chains. Walks `parentId` backwards through
 * `b1` collecting ids, then walks `b2` until it hits one of them. Returns
 * `null` when the chains never converge (e.g. one of the branches was rooted
 * independently).
 */
export const findCommonAncestor = (
  store: SnapshotStore,
  v1: VersionId,
  v2: VersionId,
): Snapshot | null => {
  const chain1 = new Set<VersionId>();
  let cursor: VersionId | null = v1;
  while (cursor) {
    chain1.add(cursor);
    cursor = parentChainNext(store, cursor);
  }
  cursor = v2;
  while (cursor) {
    if (chain1.has(cursor)) return store.get(cursor) ?? null;
    cursor = parentChainNext(store, cursor);
  }
  return null;
};

/**
 * Walk one step backward through the version chain. When the snapshot has an
 * in-branch `parentId`, follow it; otherwise cross to the parent branch via
 * `Branch.parentVersionId` so the chain reaches the shared root rather than
 * stopping at every branch boundary.
 */
const parentChainNext = (store: SnapshotStore, current: VersionId): VersionId | null => {
  const snap = store.get(current);
  if (!snap) return null;
  if (snap.parentId) return snap.parentId;
  const branch = store.branches().find((b) => b.id === snap.branchId);
  return branch?.parentVersionId ?? null;
};

/**
 * Per-category three-way merge. Rules per id:
 *
 * - `source === target` → no change.
 * - `source === base` → take `target` (target moved, source didn't).
 * - `target === base` → take `source` (source moved, target didn't).
 * - both differ from `base` → conflict.
 * - one side deleted, the other modified → conflict.
 * - one side added an id absent from `base` → take that side; both
 *   added the same id → conflict (unless identical).
 *
 * Identity comparison is enough because scene ops always return new objects
 * on change.
 */
const mergeMap = <K, V>(
  kind: SceneConflict["kind"],
  base: ReadonlyMap<K, V>,
  source: ReadonlyMap<K, V>,
  target: ReadonlyMap<K, V>,
  out: { conflicts: SceneConflict[] },
): Map<K, V> => {
  const merged = new Map<K, V>(target);
  const ids = new Set<K>([...base.keys(), ...source.keys(), ...target.keys()]);
  for (const id of ids) {
    const b = base.get(id) ?? null;
    const s = source.get(id) ?? null;
    const t = target.get(id) ?? null;
    if (s === t) continue;
    if (s === b) continue; // target took the change
    if (t === b) {
      // source took the change — apply it
      if (s === null) merged.delete(id);
      else merged.set(id, s);
      continue;
    }
    // both diverged from base → conflict
    out.conflicts.push({
      kind,
      id,
      base: b,
      source: s,
      target: t,
    } as SceneConflict);
  }
  return merged;
};

/**
 * Three-way merge of `source` into `target` over their common `base`.
 * Returns a merged scene plus the list of conflicts that need user input.
 * Auto-resolvable changes are applied directly; conflicting changes keep the
 * `target` value (callers can re-apply preferred resolutions via
 * `resolveConflict` and then re-emit a patch).
 *
 * The returned `mergedScene` keeps `target`'s viewport — viewport is
 * per-session UI state, not part of the merge contract.
 */
export const threeWayMerge = (base: Scene, source: Scene, target: Scene): MergeReport => {
  const conflicts: SceneConflict[] = [];
  const out = { conflicts };

  const shapes = mergeMap("element", base.shapes, source.shapes, target.shapes, out);
  const edges = mergeMap("link", base.edges, source.edges, target.edges, out);
  const layers = mergeMap("layer", base.layers, source.layers, target.layers, out);
  const annotations = mergeMap(
    "annotation",
    base.annotations,
    source.annotations,
    target.annotations,
    out,
  );

  const mergedScene: Scene = {
    ...target,
    shapes,
    edges,
    layers,
    annotations,
  };

  const applied: Patch[] = [];
  pushPatches(applied, "element", target.shapes, shapes);
  pushPatches(applied, "link", target.edges, edges);
  pushPatches(applied, "layer", target.layers, layers);
  pushPatches(applied, "annotation", target.annotations, annotations);

  return { applied, conflicts, mergedScene };
};

const pushPatches = <K, V>(
  out: Patch[],
  kind: "element" | "link" | "layer" | "annotation",
  before: ReadonlyMap<K, V>,
  after: ReadonlyMap<K, V>,
): void => {
  for (const [id, value] of after) {
    const prev = before.get(id);
    if (prev === value) continue;
    out.push({ kind, id, before: prev ?? null, after: value } as Patch);
  }
  for (const [id, value] of before) {
    if (!after.has(id)) {
      out.push({ kind, id, before: value, after: null } as Patch);
    }
  }
};

/**
 * Resolve a single conflict by picking a side. Returns the new scene with the
 * chosen value applied on top of `mergedScene`. `"both"` keeps the target
 * value and re-adds source as a copy with a new id — that path is the
 * responsibility of the host (it needs to generate the duplicate id), so this
 * helper only handles the single-pick cases.
 */
export const resolveConflict = (
  mergedScene: Scene,
  conflict: SceneConflict,
  pick: Exclude<ConflictResolution, "both">,
): Scene => {
  const value = pick === "source" ? conflict.source : conflict.target;
  const before = mergedScene[mapName(conflict.kind)].get(conflict.id as never) ?? null;
  if (value === before) return mergedScene;
  const patch = {
    kind: conflict.kind,
    id: conflict.id,
    before: before ?? null,
    after: value,
  } as Patch;
  return apply(mergedScene, patch);
};

const mapName = (kind: SceneConflict["kind"]): "shapes" | "edges" | "layers" | "annotations" => {
  switch (kind) {
    case "element":
      return "shapes";
    case "link":
      return "edges";
    case "layer":
      return "layers";
    case "annotation":
      return "annotations";
  }
};

/**
 * High-level branch merger. Looks up the two branches' head snapshots and
 * their common ancestor and runs `threeWayMerge`. Returns the merge report
 * and the source/target snapshots so callers can `capture` the merged result
 * back into the target branch.
 */
export const mergeBranchHeads = (
  store: SnapshotStore,
  sourceHead: VersionId,
  targetHead: VersionId,
): MergeReport => {
  const source = store.get(sourceHead);
  const target = store.get(targetHead);
  if (!source) throw new Error(`Unknown source snapshot: ${sourceHead}`);
  if (!target) throw new Error(`Unknown target snapshot: ${targetHead}`);
  const ancestor = findCommonAncestor(store, sourceHead, targetHead);
  if (!ancestor) {
    // No shared ancestor: treat the divergence point as an empty scene, so
    // every shape in source counts as "added" relative to base. Use target as
    // the base so target wins on every prior change.
    return threeWayMerge(target.scene, source.scene, target.scene);
  }
  return threeWayMerge(ancestor.scene, source.scene, target.scene);
};
