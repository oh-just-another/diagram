import { getShapesCoveredByBounds, type Scene } from "@oh-just-another/scene";
import type { Bounds, LayerId } from "@oh-just-another/types";
import * as Selection from "../../selection.js";
import { LASSO_COVERAGE_THRESHOLD } from "../../constants.js";

/**
 * Compute the selection that results from a lasso rectangle.
 *
 * `mode: "replace"` swaps the selection wholesale; `"add"` extends
 * `current` (Shift / Cmd lasso). Locked-layer shapes are skipped
 * via the host-supplied `isLayerLocked` predicate.
 *
 * Pure — returns the new selection without touching anything. The
 * caller (Editor) writes it back, clears `_selectedLink`, and
 * fires `notify()`.
 */
export const selectByBounds = (
  scene: Scene,
  current: Selection.Selection,
  isLayerLocked: (id: LayerId) => boolean,
  bounds: Bounds,
  mode: "replace" | "add",
): Selection.Selection => {
  const hits = getShapesCoveredByBounds(scene, bounds, LASSO_COVERAGE_THRESHOLD);
  let next: Selection.Selection = mode === "replace" ? Selection.EMPTY : current;
  for (const shape of hits) {
    if (isLayerLocked(shape.layerId)) continue;
    next = Selection.add(next, shape.id);
  }
  return next;
};

/**
 * Live-preview variant — bases the next selection on the captured
 * `lassoBaseSelection` snapshot so `"replace"` mode shrinks back to
 * whatever the box currently covers (instead of accumulating
 * since press-down), and `"add"` mode keeps the user's pre-existing
 * picks intact. Caller still owns the equality short-circuit and
 * the `_selectedLink` clearing.
 */
export const selectByBoundsLive = (
  scene: Scene,
  base: Selection.Selection,
  isLayerLocked: (id: LayerId) => boolean,
  bounds: Bounds,
  mode: "replace" | "add",
): Selection.Selection => {
  let next: Selection.Selection = mode === "replace" ? Selection.EMPTY : base;
  const hits = getShapesCoveredByBounds(scene, bounds, LASSO_COVERAGE_THRESHOLD);
  for (const shape of hits) {
    if (isLayerLocked(shape.layerId)) continue;
    next = Selection.add(next, shape.id);
  }
  return next;
};
