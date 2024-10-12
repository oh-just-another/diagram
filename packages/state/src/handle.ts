import type { Bounds, Vec2 } from "@oh-just-another/types";

/**
 * Eight resize-handle positions arranged around the shape's AABB. `nw` is
 * top-left, `ne` top-right, etc. `n`/`s`/`e`/`w` are edge midpoints.
 */
export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const ALL_HANDLES: readonly HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/**
 * Pixel half-size of the visible handle square. Handles are drawn
 * `HANDLE_SIZE * 2` wide. Bumped from 4 (8×8) to 5 (10×10) so the
 * mouse target reads clearly without looking heavy.
 */
export const HANDLE_SIZE = 5;

/**
 * Screen-pixel offset between the handle's centre and the shape's
 * bbox edge. Pushes the handle just outside the shape body so a
 * click in the handle area never overlaps with the shape's
 * interior hit-test — easier to grab without precision-pointing.
 */
export const HANDLE_OUTSET = 3;

/**
 * Default hit-test half-size for the mouse. Larger than `HANDLE_SIZE`
 * so the click area extends past the visual square (matches the
 * standard / x5-graph affordance). Touch hosts override with
 * `TOUCH_HANDLE_HIT_SLOP` for ≥ 44 pt finger targets.
 */
export const HANDLE_HIT_SLOP = HANDLE_SIZE + HANDLE_OUTSET;

/**
 * Position (in world coordinates) of a handle on the given bounds. The
 * position is offset outward by `HANDLE_OUTSET` screen pixels so the handle
 * sits outside the shape's bbox — the hit area never overlaps the shape body,
 * making the handle reliably grabable even when the shape covers most of the
 * click target.
 *
 * `zoom` defaults to 1 for callers that need world-coordinate positions
 * (resize math), but the rendering / hit-test path should pass the current
 * viewport zoom so the outset stays constant on screen across zoom levels.
 */
export const handlePosition = (handle: HandleId, b: Bounds, zoom = 1): Vec2 => {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const maxX = b.x + b.width;
  const maxY = b.y + b.height;
  const o = HANDLE_OUTSET / zoom;
  switch (handle) {
    case "nw":
      return { x: b.x - o, y: b.y - o };
    case "n":
      return { x: cx, y: b.y - o };
    case "ne":
      return { x: maxX + o, y: b.y - o };
    case "e":
      return { x: maxX + o, y: cy };
    case "se":
      return { x: maxX + o, y: maxY + o };
    case "s":
      return { x: cx, y: maxY + o };
    case "sw":
      return { x: b.x - o, y: maxY + o };
    case "w":
      return { x: b.x - o, y: cy };
  }
};

/**
 * Find which handle the point is over, given the shape's world bounds and the
 * current view zoom (handles stay the same size in screen pixels regardless
 * of zoom). Returns `null` if no handle is hit.
 *
 * `screenHalfSize` defaults to `HANDLE_HIT_SLOP` (mouse precision —
 * visual handle + outset on each side). Touch hosts pass a larger
 * value (`TOUCH_HANDLE_HIT_SLOP`) so a finger can grab the handle
 * without precision-pointing it.
 */
export const hitHandle = (
  point: Vec2,
  b: Bounds,
  zoom: number,
  screenHalfSize: number = HANDLE_HIT_SLOP,
): HandleId | null => {
  const halfWorld = screenHalfSize / zoom;
  for (const id of ALL_HANDLES) {
    const p = handlePosition(id, b, zoom);
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
