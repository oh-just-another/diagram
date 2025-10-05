import { bounds as B, matrix } from "@oh-just-another/math";
import type { Bounds, ElementId } from "@oh-just-another/types";
import {
  getScreenToWorld,
  getElement,
  getElementWorldBounds,
  type Scene,
} from "@oh-just-another/scene";
import { VIEWPORT_CULL_PADDING_RATIO } from "../constants.js";

/**
 * World-space AABB of the screen viewport, inflated by ~10% so a slow pan
 * does not flicker shapes near the edge. Returns `null` until the host has
 * resized the viewport at least once (size is 0×0). Depends only on
 * `scene.viewport`.
 */
export const computeViewportWorld = (scene: Scene): Bounds | null => {
  const vp = scene.viewport;
  const w = vp.size.width;
  const h = vp.size.height;
  if (w <= 0 || h <= 0) return null;
  const s2w = getScreenToWorld(vp);
  const corners = [
    matrix.applyToPoint(s2w, { x: 0, y: 0 }),
    matrix.applyToPoint(s2w, { x: w, y: 0 }),
    matrix.applyToPoint(s2w, { x: 0, y: h }),
    matrix.applyToPoint(s2w, { x: w, y: h }),
  ];
  const bb = B.fromPoints(corners);
  return B.expand(bb, Math.max(bb.width, bb.height) * VIEWPORT_CULL_PADDING_RATIO);
};

/**
 * Union of every direct/indirect descendant's world AABB. `null` for empty
 * groups (the only failure mode — every leaf has bounds). Used to derive an
 * effective bbox for a group shape since `getElementWorldBounds(group)`
 * returns nothing intrinsic.
 */
export const groupChildrenUnion = (scene: Scene, groupId: ElementId): Bounds | null => {
  let acc: Bounds | null = null;
  for (const s of scene.elements.values()) {
    if (s.parentId !== groupId) continue;
    const inner =
      s.type === "group" ? groupChildrenUnion(scene, s.id) : getElementWorldBounds(s);
    if (!inner) continue;
    acc = acc ? B.union(acc, inner) : inner;
  }
  return acc;
};

/**
 * Combined world-space AABB of every currently selected shape. Returns `null`
 * when the selection is empty or none of its members resolve to a valid
 * shape. Group shapes carry no intrinsic geometry, so substitute their
 * `groupChildrenUnion`.
 */
export const combinedSelectionBounds = (
  scene: Scene,
  selection: Iterable<ElementId>,
): Bounds | null => {
  let acc: Bounds | null = null;
  for (const id of selection) {
    const s = getElement(scene, id);
    if (!s) continue;
    const b = s.type === "group" ? groupChildrenUnion(scene, s.id) : getElementWorldBounds(s);
    if (!b) continue;
    acc = acc ? B.union(acc, b) : b;
  }
  return acc;
};
