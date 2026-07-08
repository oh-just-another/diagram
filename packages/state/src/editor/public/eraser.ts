import type { Element, Scene, Patch } from "@oh-just-another/scene";
import type { ElementId, Vec2 } from "@oh-just-another/types";
import * as Selection from "../../selection.js";
import { computeDeleteSelection } from "./selection-ops.js";
import { ERASER_SAMPLE_STEP } from "../../constants.js";

/**
 * Mutable state of an in-progress eraser stroke. The editor owns one instance
 * and delegates the four lifecycle calls (begin / extend / commit / cancel)
 * through it. `pending` is the set of element ids swept so far (previewed
 * dimmed, deleted on release); `last` is the previous sampled world point so
 * the next extend can sample the segment between them.
 */
export interface EraseStrokeState {
  readonly pending: Set<ElementId>;
  last: Vec2;
}

export const beginEraseStroke = (world: Vec2): EraseStrokeState => ({
  pending: new Set<ElementId>(),
  last: world,
});

/**
 * Sample points along the segment `from → to` at {@link ERASER_SAMPLE_STEP}
 * spacing, hit-test each through `hitAt`, and add every hit element's id to
 * `pending`. Sampling (rather than testing only the endpoint) stops a fast
 * swipe from skipping small shapes between two pointer-move events. Returns
 * `true` when at least one new id was added (so the caller can skip a redundant
 * re-render). Mutates `pending` in place.
 */
export const sampleErase = (
  from: Vec2,
  to: Vec2,
  hitAt: (p: Vec2) => Element | undefined,
  pending: Set<ElementId>,
): boolean => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / ERASER_SAMPLE_STEP));
  let added = false;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const hit = hitAt({ x: from.x + dx * t, y: from.y + dy * t });
    if (hit && !pending.has(hit.id)) {
      pending.add(hit.id);
      added = true;
    }
  }
  return added;
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
