import type { Element, Scene, Patch } from "@oh-just-another/scene";
import type { ElementId, Vec2 } from "@oh-just-another/types";
import * as Selection from "../../selection.js";
import { computeDeleteSelection } from "./selection-ops.js";
import { ERASER_SAMPLE_STEP } from "../../constants.js";
import type { Interval } from "./stroke-eraser-coverage.js";

/**
 * Mutable state of an in-progress eraser stroke. The editor owns one instance
 * and delegates the four lifecycle calls (begin / extend / commit / cancel)
 * through it. `pending` is the set of element ids swept so far (previewed
 * dimmed, deleted on release); `last` is the previous sampled world point so
 * the next extend can sample the segment between them.
 *
 * `strokeMode` (Shift held at press) switches the gesture to STROKE-ERASE:
 * brush strokes are cut into fragments instead of deleted whole; non-brush
 * shapes still object-erase. `erased` maps each touched brush id to the covered
 * arc-length spans erased so far — the editor grows it INCREMENTALLY (each move
 * accumulates only the new segment via `markErasedIntervals`), so the cost per
 * move is O(points) instead of O(points × path length) per frame. The eraser cuts
 * the stroke's GEOMETRY by arc length, not by vertex, so a big disc grazing a
 * sparse line still removes the covered span. Unused in object mode.
 */
export interface EraseStrokeState {
  readonly pending: Set<ElementId>;
  last: Vec2;
  /** Per-brush covered arc-length spans, grown incrementally in stroke mode. */
  readonly erased: Map<ElementId, Interval[]>;
  /** Shift held at press: cut brush strokes instead of deleting them. */
  readonly strokeMode: boolean;
}

export const beginEraseStroke = (world: Vec2, strokeMode = false): EraseStrokeState => ({
  pending: new Set<ElementId>(),
  last: world,
  erased: new Map<ElementId, Interval[]>(),
  strokeMode,
});

/**
 * Sample points along the segment `from → to` at {@link ERASER_SAMPLE_STEP}
 * spacing, hit-test each through `hitAt`, and mark every hit element in
 * `pending`. Sampling (rather than testing only the endpoint) stops a fast
 * swipe from skipping small shapes between two pointer-move events.
 *
 * `restore` flips the direction: normally hits are ADDED to `pending`
 * (marked-for-erase); with `restore` (Alt held) a hit already in `pending` is
 * REMOVED (un-marked), so dragging back over a marked shape with Alt rescues it
 * — matching the Excalidraw eraser. Returns `true` when `pending` changed (so
 * the caller can skip a redundant re-render). Mutates `pending` in place.
 *
 * In `strokeMode` (Shift), brush hits are skipped here — brushes are cut by the
 * path-based stroke-erase on commit, not added to the object-delete `pending`.
 */
export const sampleErase = (
  from: Vec2,
  to: Vec2,
  hitAt: (p: Vec2) => Element | undefined,
  pending: Set<ElementId>,
  restore = false,
  strokeMode = false,
): boolean => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / ERASER_SAMPLE_STEP));
  let changed = false;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const hit = hitAt({ x: from.x + dx * t, y: from.y + dy * t });
    if (!hit) continue;
    if (strokeMode && hit.type === "brush") continue;
    if (restore) {
      if (pending.delete(hit.id)) changed = true;
    } else if (!pending.has(hit.id)) {
      pending.add(hit.id);
      changed = true;
    }
  }
  return changed;
};

/**
 * Produce the scene + patches that delete every id in `pending` (dropping any
 * attached links first, exactly like a Delete-key delete). Returns `null` when
 * nothing valid remains to erase. Reuses {@link computeDeleteSelection} so the
 * eraser and the selection-delete share one implementation.
 */
export const computeEraseCommit = (
  scene: Scene,
  pending: ReadonlySet<ElementId>,
): { readonly scene: Scene; readonly patches: Patch[] } | null => {
  let sel: Selection.Selection = Selection.EMPTY;
  for (const id of pending) {
    if (scene.elements.has(id)) sel = Selection.add(sel, id);
  }
  if (sel.size === 0) return null;
  return computeDeleteSelection(scene, sel, new Set());
};
