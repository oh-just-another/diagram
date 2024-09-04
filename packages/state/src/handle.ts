import type { Bounds, Vec2 } from "@oh-just-another/types";

/**
 * Eight resize-handle positions arranged around the shape's AABB. `nw` is
 * top-left, `ne` top-right, etc. `n`/`s`/`e`/`w` are edge midpoints.
 */
export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const ALL_HANDLES: readonly HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Pixel half-size of a square handle; handles are drawn `HANDLE_SIZE * 2` wide. */
export const HANDLE_SIZE = 4;

/** Position (in world coordinates) of a handle on the given bounds. */
export const handlePosition = (handle: HandleId, b: Bounds): Vec2 => {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const maxX = b.x + b.width;
  const maxY = b.y + b.height;
  switch (handle) {
    case "nw":
      return { x: b.x, y: b.y };
    case "n":
      return { x: cx, y: b.y };
    case "ne":
      return { x: maxX, y: b.y };
    case "e":
      return { x: maxX, y: cy };
    case "se":
      return { x: maxX, y: maxY };
    case "s":
      return { x: cx, y: maxY };
    case "sw":
      return { x: b.x, y: maxY };
    case "w":
      return { x: b.x, y: cy };
  }
};

/**
 * Find which handle the point is over, given the shape's world bounds and the
 * current view zoom (handles stay the same size in screen pixels regardless
 * of zoom). Returns `null` if no handle is hit.
 *
 * `screenHalfSize` defaults to `HANDLE_SIZE` (mouse precision). Touch
 * hosts pass a larger value (`TOUCH_HANDLE_HIT_SLOP`) so a finger can
 * grab the handle without precision-pointing it.
 */
export const hitHandle = (
  point: Vec2,
  b: Bounds,
  zoom: number,
  screenHalfSize: number = HANDLE_SIZE,
): HandleId | null => {
  const halfWorld = screenHalfSize / zoom;
  for (const id of ALL_HANDLES) {
    const p = handlePosition(id, b);
    if (Math.abs(point.x - p.x) <= halfWorld && Math.abs(point.y - p.y) <= halfWorld) {
      return id;
    }
  }
  return null;
};

/**
 * Apply a delta in world coordinates to bounds, using the given handle as the
 * grab point. Anchor (opposite corner) stays fixed. The result may have
 * negative width/height while dragging — `bounds.normalize` in `@math` flips
 * it on commit.
 */
export const resizeBounds = (b: Bounds, handle: HandleId, delta: Vec2): Bounds => {
  let { x, y, width, height } = b;
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
