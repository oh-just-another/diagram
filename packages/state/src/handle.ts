import type { Bounds, Vec2 } from "@oh-just-another/types";
import { HANDLE_HIT_SLOP, HANDLE_OUTSET, HANDLE_SIZE } from "./constants.js";

/**
 * Eight resize-handle positions arranged around the shape's AABB. `nw` is
 * top-left, `ne` top-right, etc. `n`/`s`/`e`/`w` are edge midpoints.
 */
export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const ALL_HANDLES: readonly HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/**
 * Subset of `ALL_HANDLES` containing only the four corner positions. Used for
 * aspect-locked resize (groups, fixed-ratio media) — only corner drags carry
 * the diagonal that the resize math projects onto a single scale factor.
 */
export const CORNER_HANDLES: readonly HandleId[] = ["nw", "ne", "se", "sw"];

/**
 * CSS `cursor` for a resize handle — the bidirectional arrow aligned with the
 * handle's resize axis. Opposite handles share a cursor (e.g. `nw`/`se` →
 * `nwse-resize`). Used by the editor's context-cursor logic.
 *
 * Ignores element rotation — a rotated shape's handles technically want a
 * rotated cursor, but CSS only offers the 8 fixed arrows; we map by handle id.
 */
export const cursorForHandle = (handle: HandleId): string => {
  switch (handle) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
  }
};

/**
 * Handle geometry / hit-target constants. `HANDLE_HIT_SLOP` is decoupled from
 * `HANDLE_SIZE`/`HANDLE_OUTSET` — the grab area grows independently of the
 * drawn square.
 */
export { HANDLE_HIT_SLOP, HANDLE_OUTSET, HANDLE_SIZE };

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
 * Find which resize handle the point is over, given the shape's world bounds
 * and the current view zoom (hit area stays constant in screen pixels).
 * Returns `null` if nothing is hit.
 *
 * Two grab shapes, so the edge-midpoint dots can be removed from the chrome
 * while edge resize stays available (drag the selection-box side itself):
 *
 *   • Corners (`nw/ne/se/sw`) — a square grab at the drawn corner dot (offset
 *     outward by `HANDLE_OUTSET`). Checked first so a near-corner point
 *     resolves to the diagonal, not an edge.
 *   • Edges (`n/s/e/w`) — the WHOLE side of the box: a slop band along the
 *     corresponding bounds edge, spanning between the corners. No dot is drawn
 *     for these; the side line is the target.
 *
 * Edges only participate when present in `handleSet` (e.g. aspect-locked
 * resize passes `CORNER_HANDLES`, so only corners hit). The returned id feeds
 * the same `resizeBounds` / resize dispatch.
 *
 * `screenHalfSize` defaults to `HANDLE_HIT_SLOP` (mouse); touch hosts pass
 * `TOUCH_HANDLE_HIT_SLOP` so a finger can grab without precision-pointing.
 */
export const hitHandle = (
  point: Vec2,
  b: Bounds,
  zoom: number,
  screenHalfSize: number = HANDLE_HIT_SLOP,
  handleSet: readonly HandleId[] = ALL_HANDLES,
): HandleId | null => {
  const slop = screenHalfSize / zoom;
  // Corners — point-grab at each drawn dot.
  for (const id of handleSet) {
    if (id.length !== 2) continue; // skip edges this pass
    const p = handlePosition(id, b, zoom);
    if (Math.abs(point.x - p.x) <= slop && Math.abs(point.y - p.y) <= slop) {
      return id;
    }
  }
  // Edges — slop band along the selection-box side, between the corners.
  const minX = b.x;
  const maxX = b.x + b.width;
  const minY = b.y;
  const maxY = b.y + b.height;
  const onX = point.x >= minX - slop && point.x <= maxX + slop;
  const onY = point.y >= minY - slop && point.y <= maxY + slop;
  for (const id of handleSet) {
    switch (id) {
      case "n":
        if (onX && Math.abs(point.y - minY) <= slop) return "n";
        break;
      case "s":
        if (onX && Math.abs(point.y - maxY) <= slop) return "s";
        break;
      case "w":
        if (onY && Math.abs(point.x - minX) <= slop) return "w";
        break;
      case "e":
        if (onY && Math.abs(point.x - maxX) <= slop) return "e";
        break;
    }
  }
  return null;
};

/**
 * Apply a delta in world coordinates to bounds, using the given handle as the
 * grab point. Anchor (opposite corner) stays fixed. The result may have
 * negative width/height while dragging — bounds normalization flips it on
 * commit.
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
