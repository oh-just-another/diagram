import { bounds as B } from "@oh-just-another/math";
import type { Bounds, Vec2 } from "@oh-just-another/types";
import type { HandleId } from "../handle.js";

/**
 * Resize a world-space AABB by applying the handle delta directly, for the
 * case where the shape's local AABB starts at (0, 0) — operating on the world
 * bounds captured at press-down. Kept here, separate from the handle module,
 * to avoid a circular import.
 */
export const resizeFromHandle = (b: Bounds, handle: HandleId, delta: Vec2): Bounds => {
  let x = b.x;
  let y = b.y;
  let width = b.width;
  let height = b.height;
  switch (handle) {
    case "nw":
      x += delta.x;
      y += delta.y;
      width -= delta.x;
      height -= delta.y;
      break;
    case "n":
      y += delta.y;
      height -= delta.y;
      break;
    case "ne":
      y += delta.y;
      width += delta.x;
      height -= delta.y;
      break;
    case "e":
      width += delta.x;
      break;
    case "se":
      width += delta.x;
      height += delta.y;
      break;
    case "s":
      height += delta.y;
      break;
    case "sw":
      x += delta.x;
      width -= delta.x;
      height += delta.y;
      break;
    case "w":
      x += delta.x;
      width -= delta.x;
      break;
  }
  return { x, y, width, height };
};

/**
 * Re-anchor a freshly-resized AABB to grow symmetrically about the original
 * centre: the size change from the dragged handle is mirrored to the opposite
 * side (so the single-side delta doubles), keeping the centre fixed.
 * Handle-agnostic — an edge drag expands only its axis, a corner drag both.
 */
export const resizeFromCenter = (original: Bounds, raw: Bounds): Bounds => {
  const cx = original.x + original.width / 2;
  const cy = original.y + original.height / 2;
  const width = original.width + 2 * (raw.width - original.width);
  const height = original.height + 2 * (raw.height - original.height);
  return { x: cx - width / 2, y: cy - height / 2, width, height };
};

/**
 * Adjust a freshly-resized AABB so it keeps the original's aspect ratio: the
 * axis with the larger relative change drives a uniform scale, the other
 * follows. Position is left untouched — the caller's anchor pass re-pins the
 * edge opposite the dragged handle. Signs are preserved so a drag past the
 * anchor still mirrors uniformly. A degenerate original (zero side) is
 * returned unchanged.
 */
export const lockAspectRatio = (original: Bounds, raw: Bounds): Bounds => {
  if (original.width === 0 || original.height === 0) return raw;
  const sx = raw.width / original.width;
  const sy = raw.height / original.height;
  const factor = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
  return {
    x: raw.x,
    y: raw.y,
    width: original.width * factor,
    height: original.height * factor,
  };
};

export interface ResizeConstraints {
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly noFlip?: boolean;
}

const handleAffectsLeft = (h: HandleId): boolean => h === "nw" || h === "w" || h === "sw";
const handleAffectsRight = (h: HandleId): boolean => h === "ne" || h === "e" || h === "se";
const handleAffectsTop = (h: HandleId): boolean => h === "nw" || h === "n" || h === "ne";
const handleAffectsBottom = (h: HandleId): boolean => h === "sw" || h === "s" || h === "se";

/**
 * Apply min/max + no-flip constraints to a freshly-computed `raw` bounds.
 *
 * The constraints anchor on the edge opposite the dragged handle — dragging
 * `se` keeps `(original.x, original.y)` fixed and adjusts width/height;
 * dragging `nw` keeps the bottom-right corner. This matches the visual
 * expectation that the opposite edge stays put.
 *
 * `noFlip` forces width/height to stay non-negative (or above `minWidth` /
 * `minHeight` if set). Without it, dragging past the opposite edge mirrors
 * the shape, which `bounds.normalize` then resolves.
 */
export const applyResizeConstraints = (
  original: Bounds,
  raw: Bounds,
  handle: HandleId,
  constraints: ResizeConstraints,
  fromCenter = false,
): Bounds => {
  const minW = constraints.noFlip ? (constraints.minWidth ?? 0) : constraints.minWidth;
  const minH = constraints.noFlip ? (constraints.minHeight ?? 0) : constraints.minHeight;
  const maxW = constraints.maxWidth;
  const maxH = constraints.maxHeight;

  const clamp = (v: number, lo: number | undefined, hi: number | undefined): number => {
    let r = v;
    if (lo !== undefined && r < lo) r = lo;
    if (hi !== undefined && r > hi) r = hi;
    return r;
  };

  let width = raw.width;
  if (constraints.noFlip) {
    width = clamp(width, minW, maxW);
  } else if (maxW !== undefined && Math.abs(width) > maxW) {
    width = width < 0 ? -maxW : maxW;
  } else if (minW !== undefined && Math.abs(width) < minW && width !== 0) {
    width = width < 0 ? -minW : minW;
  }

  let height = raw.height;
  if (constraints.noFlip) {
    height = clamp(height, minH, maxH);
  } else if (maxH !== undefined && Math.abs(height) > maxH) {
    height = height < 0 ? -maxH : maxH;
  } else if (minH !== undefined && Math.abs(height) < minH && height !== 0) {
    height = height < 0 ? -minH : minH;
  }

  // Centre-anchored resize: pin the original centre, so the clamped box grows
  // symmetrically. Magnitudes only — a centred box never mirrors.
  if (fromCenter) {
    const w = constraints.noFlip ? width : Math.abs(width);
    const h = constraints.noFlip ? height : Math.abs(height);
    const cx = original.x + original.width / 2;
    const cy = original.y + original.height / 2;
    return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
  }

  // Default: the edge opposite the dragged handle stays put.
  let x = raw.x;
  if (handleAffectsLeft(handle) && !handleAffectsRight(handle)) {
    x = original.x + original.width - width;
  } else if (handleAffectsRight(handle) && !handleAffectsLeft(handle)) {
    x = original.x;
  }
  let y = raw.y;
  if (handleAffectsTop(handle) && !handleAffectsBottom(handle)) {
    y = original.y + original.height - height;
  } else if (handleAffectsBottom(handle) && !handleAffectsTop(handle)) {
    y = original.y;
  }

  const out = { x, y, width, height };
  return constraints.noFlip ? out : B.normalize(out);
};
