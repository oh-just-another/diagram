import { bounds as B } from "@oh-just-another/math";
import {
  getElement,
  getElementWorldBounds,
  type Element,
  type Patch,
  type Scene,
} from "@oh-just-another/scene";
import type { Bounds, ElementId } from "@oh-just-another/types";

export type FlipAxis = "horizontal" | "vertical";

/** Which edge / centre line the selection aligns to within its bounding box. */
export type AlignEdge = "left" | "h-center" | "right" | "top" | "v-center" | "bottom";

/** Collect the live elements for `ids`, skipping any that no longer exist. */
const collect = (scene: Scene, ids: Iterable<ElementId>): Element[] => {
  const out: Element[] = [];
  for (const id of ids) {
    const el = getElement(scene, id);
    if (el) out.push(el);
  }
  return out;
};

/** World-space AABB enclosing every element in `elements` (assumed non-empty). */
const enclosingBounds = (elements: readonly Element[]): Bounds =>
  elements.map((el) => getElementWorldBounds(el)).reduce((acc, b) => B.union(acc, b));

/**
 * Pure: mirror every selected element about the combined selection's centre on
 * the given axis. Each element's position reflects across the centre and its
 * scale sign flips on that axis, so the content mirrors in place; size is
 * unchanged. Mirroring a single element flips it about its own centre. Edges
 * bound to the moved elements re-route from their endpoints; free links are
 * left untouched.
 */
export const computeFlipPatches = (
  scene: Scene,
  ids: Iterable<ElementId>,
  axis: FlipAxis,
): Patch[] => {
  const elements = collect(scene, ids);
  if (elements.length === 0) return [];
  const box = enclosingBounds(elements);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const horizontal = axis === "horizontal";

  const patches: Patch[] = [];
  for (const el of elements) {
    const after: Element = horizontal
      ? {
          ...el,
          position: { x: 2 * cx - el.position.x, y: el.position.y },
          scale: { x: -el.scale.x, y: el.scale.y },
        }
      : {
          ...el,
          position: { x: el.position.x, y: 2 * cy - el.position.y },
          scale: { x: el.scale.x, y: -el.scale.y },
        };
    patches.push({ kind: "element", id: el.id, before: el, after });
  }
  return patches;
};

/**
 * Pure: align every selected element to the given edge / centre line of the
 * combined selection's bounding box (e.g. `left` moves each shape so its left
 * edge meets the box's left edge; `h-center` lines up horizontal centres).
 * Only the relevant axis moves; sizes are unchanged. A no-op below two
 * elements.
 */
export const computeAlignPatches = (
  scene: Scene,
  ids: Iterable<ElementId>,
  edge: AlignEdge,
): Patch[] => {
  const elements = collect(scene, ids);
  if (elements.length < 2) return [];
  const box = enclosingBounds(elements);

  const patches: Patch[] = [];
  for (const el of elements) {
    const b = getElementWorldBounds(el);
    let dx = 0;
    let dy = 0;
    switch (edge) {
      case "left":
        dx = box.x - b.x;
        break;
      case "right":
        dx = box.x + box.width - (b.x + b.width);
        break;
      case "h-center":
        dx = box.x + box.width / 2 - (b.x + b.width / 2);
        break;
      case "top":
        dy = box.y - b.y;
        break;
      case "bottom":
        dy = box.y + box.height - (b.y + b.height);
        break;
      case "v-center":
        dy = box.y + box.height / 2 - (b.y + b.height / 2);
        break;
    }
    if (dx === 0 && dy === 0) continue;
    const after: Element = { ...el, position: { x: el.position.x + dx, y: el.position.y + dy } };
    patches.push({ kind: "element", id: el.id, before: el, after });
  }
  return patches;
};
