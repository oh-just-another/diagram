import type { Bounds } from "@oh-just-another/types";
import { getElementWorldBounds, type ElementBase } from "./shape.js";

/**
 * Some elements PAINT beyond their geometric bounds — a frame draws its
 * header strip above the rectangle, a confetti box throws particles past
 * its edges. The dirty-rect / tile invalidation must clear that overspill
 * too, otherwise deleting (or moving without a full repaint) leaves a
 * "ghost" of the overpainted region.
 *
 * `RenderOverflow` is the per-side extra paint margin (world units) an
 * element type bleeds past `getElementWorldBounds`. Providers are keyed by
 * element `type` and may inspect the shape (e.g. only confetti-tagged
 * rectangles overflow). All sides default to 0.
 */
export interface RenderOverflow {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
}

type RenderOverflowProvider = (shape: ElementBase) => RenderOverflow;

const providers = new Map<string, RenderOverflowProvider>();

/**
 * Register how far an element type paints past its bounds. The renderer
 * that draws the overspill owns this (it knows the header height /
 * particle spread). Idempotent per type — last registration wins.
 */
export const registerRenderOverflow = (type: string, fn: RenderOverflowProvider): void => {
  providers.set(type, fn);
};

/**
 * World bounds expanded by the element type's registered paint overflow —
 * the region that must be invalidated/cleared when the element changes or
 * is removed. Falls back to the plain world bounds when no overflow is
 * registered (the common case).
 */
export const getElementRenderBounds = (shape: ElementBase): Bounds => {
  const b = getElementWorldBounds(shape);
  const fn = providers.get(shape.type);
  if (!fn) return b;
  const o = fn(shape);
  const top = o.top ?? 0;
  const right = o.right ?? 0;
  const bottom = o.bottom ?? 0;
  const left = o.left ?? 0;
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return b;
  return {
    x: b.x - left,
    y: b.y - top,
    width: b.width + left + right,
    height: b.height + top + bottom,
  };
};
