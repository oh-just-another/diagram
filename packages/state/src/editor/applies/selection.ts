import { getElementsCoveredByBounds, getLinkPath, type Scene } from "@oh-just-another/scene";
import type { Bounds, LayerId, Vec2 } from "@oh-just-another/types";
import * as Selection from "../../selection.js";
import * as LinkSelection from "../../link-selection.js";
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
  const hits = getElementsCoveredByBounds(scene, bounds, LASSO_COVERAGE_THRESHOLD);
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
  const hits = getElementsCoveredByBounds(scene, bounds, LASSO_COVERAGE_THRESHOLD);
  for (const shape of hits) {
    if (isLayerLocked(shape.layerId)) continue;
    next = Selection.add(next, shape.id);
  }
  return next;
};

const inside = (p: Vec2, b: Bounds): boolean =>
  p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

/**
 * Link half of the marquee. A connector is captured when its ENTIRE drawn
 * path lies inside `bounds` (fully-enclosed rule), so dragging a box across
 * the canvas grabs only the links that are wholly within it. `"replace"`
 * rebuilds from the box each frame; `"add"` keeps the pre-lasso link picks
 * (`base`).
 */
export const selectLinksByBoundsLive = (
  scene: Scene,
  base: LinkSelection.LinkSelection,
  isLayerLocked: (id: LayerId) => boolean,
  bounds: Bounds,
  mode: "replace" | "add",
): LinkSelection.LinkSelection => {
  let next: LinkSelection.LinkSelection = mode === "replace" ? LinkSelection.EMPTY : base;
  for (const edge of scene.links.values()) {
    if (isLayerLocked(edge.layerId)) continue;
    const path = getLinkPath(scene, edge);
    if (!path || path.length < 2) continue;
    if (path.every((p) => inside(p, bounds))) next = LinkSelection.add(next, edge.id);
  }
  return next;
};
