import type { ShapeId } from "@oh-just-another/types";
import type { Scene } from "./scene.js";
import type { Shape } from "./shape.js";

/**
 * Pure three-way merge for scene shapes. Takes the common ancestor of two
 * branches + the two heads, returns a merge report:
 *
 *   - `autoMerged.shapes` — every shape that could be auto-resolved.
 *     A change is auto-applied when at most one branch touched it
 *     vs the ancestor; both-touched-identically is also auto-applied
 *     (degenerate "no conflict").
 *   - `conflicts[]` — shapes where ancestor / source / target all
 *     diverge differently. Host UI (`<MergeDialog>`) presents these
 *     for user resolution; `applyConflictResolution` produces the
 *     final scene from a chosen `ours / theirs / both` per conflict.
 *
 * No history / patch generation here — caller composes the
 * resolved Scene and pushes it through `Editor.loadScene` (or
 * derives a patch via `diffSceneShapes`).
 *
 * Equality semantics: scene mutations always produce fresh shape
 * references via `apply(scene, patch)`. Reference equality is
 * sufficient to detect "did this branch touch the shape?". For
 * cross-process / cross-document scenarios where references differ
 * naturally, callers can pass a custom `compareShapes` predicate.
 */
export interface ThreeWayMergeReport {
  /** Best-effort merged scene; conflicts retain the `target` version. */
  readonly autoMerged: Scene;
  readonly conflicts: readonly ThreeWayMergeConflict[];
}

export interface ThreeWayMergeConflict {
  readonly shapeId: ShapeId;
  /** Shape as it stood in the common ancestor (or null when added in both branches). */
  readonly base: Shape | null;
  readonly source: Shape | null;
  readonly target: Shape | null;
}

export interface ThreeWayMergeOptions {
  /**
   * Custom equality predicate. Default = reference equality (the
   * intended use; scene mutations always allocate new shape objects).
   */
  readonly compareShapes?: (a: Shape, b: Shape) => boolean;
}

export const mergeScenesThreeWay = (
  ancestor: Scene,
  source: Scene,
  target: Scene,
  options: ThreeWayMergeOptions = {},
): ThreeWayMergeReport => {
  const eq = options.compareShapes ?? ((a, b) => a === b);
  const conflicts: ThreeWayMergeConflict[] = [];
  // Start from target — conflicts default to keeping target until
  // the host resolves them.
  const merged = new Map(target.shapes);

  const allIds = new Set<ShapeId>();
  for (const id of ancestor.shapes.keys()) allIds.add(id);
  for (const id of source.shapes.keys()) allIds.add(id);
  for (const id of target.shapes.keys()) allIds.add(id);

  for (const id of allIds) {
    const a = ancestor.shapes.get(id) ?? null;
    const s = source.shapes.get(id) ?? null;
    const t = target.shapes.get(id) ?? null;

    // Case 1: no change in either branch — keep target's version.
    if (a !== null && s !== null && t !== null && eq(s, a) && eq(t, a)) continue;

    // Case 2: only source changed (target untouched vs ancestor).
    if (a !== null && t !== null && eq(t, a)) {
      if (s === null) merged.delete(id);
      else merged.set(id, s);
      continue;
    }
    // Case 2': only target changed (source untouched vs ancestor).
    if (a !== null && s !== null && eq(s, a)) {
      // target already in `merged`; keep as-is.
      continue;
    }
    // Case 3: source removed, target unchanged → take the removal.
    if (a !== null && s === null && t !== null && eq(t, a)) {
      merged.delete(id);
      continue;
    }
    // Case 3': target removed, source unchanged → keep target's
    // removal (deletion already in merged map).
    if (a !== null && t === null && s !== null && eq(s, a)) {
      continue;
    }
    // Case 4: same change in both branches — accept either.
    if (s !== null && t !== null && eq(s, t)) continue;
    // Case 4': both removed.
    if (s === null && t === null) {
      merged.delete(id);
      continue;
    }
    // Case 5: shape added in source only (not in ancestor or target).
    if (a === null && t === null && s !== null) {
      merged.set(id, s);
      continue;
    }
    // Case 5': shape added in target only — already in merged.
    if (a === null && s === null && t !== null) continue;

    // Anything else is a genuine conflict.
    conflicts.push({ shapeId: id, base: a, source: s, target: t });
  }

  // Scene wrapper: keep target's edges / layers / viewport /
  // annotations — only the shapes pass through three-way merge.
  const autoMerged: Scene = { ...target, shapes: merged };
  return { autoMerged, conflicts };
};

/**
 * Apply user-supplied resolutions to a merge report's conflicts and
 * return the final scene. Each resolution picks `ours` (target),
 * `theirs` (source), or `both` (target keeps original; source lands
 * as a duplicate via the `cloneWithNewId` helper supplied by the
 * caller — defaults to a "{id}-copy" suffix).
 */
export interface ConflictResolutionInput {
  readonly shapeId: ShapeId;
  readonly choice: "ours" | "theirs" | "both";
}

export const applyConflictResolutions = (
  report: ThreeWayMergeReport,
  resolutions: readonly ConflictResolutionInput[],
  cloneWithNewId: (shape: Shape) => Shape = defaultClone,
): Scene => {
  const merged = new Map(report.autoMerged.shapes);
  const byId = new Map<ShapeId, ThreeWayMergeConflict>();
  for (const c of report.conflicts) byId.set(c.shapeId, c);

  for (const res of resolutions) {
    const c = byId.get(res.shapeId);
    if (!c) continue;
    switch (res.choice) {
      case "ours":
        if (c.target !== null) merged.set(c.shapeId, c.target);
        else merged.delete(c.shapeId);
        break;
      case "theirs":
        if (c.source !== null) merged.set(c.shapeId, c.source);
        else merged.delete(c.shapeId);
        break;
      case "both":
        if (c.target !== null) merged.set(c.shapeId, c.target);
        else merged.delete(c.shapeId);
        if (c.source !== null) {
          const dup = cloneWithNewId(c.source);
          merged.set(dup.id, dup);
        }
        break;
    }
  }
  return { ...report.autoMerged, shapes: merged };
};

const defaultClone = (shape: Shape): Shape => {
  const nextId = `${shape.id}-copy` as ShapeId;
  return { ...shape, id: nextId };
};
