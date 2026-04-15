import type { Bounds, Vec2 } from "@oh-just-another/types";
import type { ElementId } from "@oh-just-another/types";
import type { HandleId } from "../../handle.js";

/**
 * Snap-to-grid math. Pure functions that round gesture deltas / bounds
 * onto a grid of `spacing` world units. The editor wrappers call these
 * before handing the (adjusted) delta to the move / resize / create
 * compute functions, so the snapping logic lives in one tested place
 * and the compute functions stay grid-agnostic.
 *
 * Spacing resolution and the on/off gate live in scene
 * (`resolveSnapSpacing` / `isSnapToGridEnabled`); these helpers assume
 * snapping is on and `spacing > 0`.
 */

/** Round a world point to the nearest grid intersection. */
export const snapPointToGrid = (p: Vec2, spacing: number): Vec2 => ({
  x: Math.round(p.x / spacing) * spacing,
  y: Math.round(p.y / spacing) * spacing,
});

/**
 * Adjust a single-shape move delta so the shape's press-time top-left
 * (`originalBounds` origin) lands on the grid. Keeps the drag anchored
 * to the grid regardless of where the shape started.
 */
export const snapMoveDelta = (originalBounds: Bounds, delta: Vec2, spacing: number): Vec2 => {
  const target = snapPointToGrid(
    { x: originalBounds.x + delta.x, y: originalBounds.y + delta.y },
    spacing,
  );
  return { x: target.x - originalBounds.x, y: target.y - originalBounds.y };
};

/**
 * Adjust a group-move delta so the group's top-most-left reference
 * point snaps to the grid while every member keeps its relative
 * position. The reference is the min corner across the press-time
 * origins (each origin is an element's world position). Returns the
 * delta unchanged when the snapshot is empty.
 */
export const snapGroupDelta = (
  origins: ReadonlyMap<ElementId, Vec2>,
  delta: Vec2,
  spacing: number,
): Vec2 => {
  let refX = Infinity;
  let refY = Infinity;
  for (const o of origins.values()) {
    if (o.x < refX) refX = o.x;
    if (o.y < refY) refY = o.y;
  }
  if (!Number.isFinite(refX)) return delta;
  const target = snapPointToGrid({ x: refX + delta.x, y: refY + delta.y }, spacing);
  return { x: target.x - refX, y: target.y - refY };
};

const HANDLE_MOVES_WEST: ReadonlySet<HandleId> = new Set(["nw", "w", "sw"]);
const HANDLE_MOVES_EAST: ReadonlySet<HandleId> = new Set(["ne", "e", "se"]);
const HANDLE_MOVES_NORTH: ReadonlySet<HandleId> = new Set(["nw", "n", "ne"]);
const HANDLE_MOVES_SOUTH: ReadonlySet<HandleId> = new Set(["sw", "s", "se"]);

/**
 * Adjust a resize delta so the edge(s) the handle drags land on the
 * grid. Only the axes the handle actually controls are snapped: edge
 * handles (`n`/`s`/`e`/`w`) snap one axis, corners snap both. The
 * stationary edges are untouched.
 */
export const snapResizeDelta = (
  originalBounds: Bounds,
  handle: HandleId,
  delta: Vec2,
  spacing: number,
): Vec2 => {
  let dx = delta.x;
  let dy = delta.y;
  if (HANDLE_MOVES_WEST.has(handle) || HANDLE_MOVES_EAST.has(handle)) {
    const edgeX = HANDLE_MOVES_WEST.has(handle)
      ? originalBounds.x
      : originalBounds.x + originalBounds.width;
    dx = Math.round((edgeX + delta.x) / spacing) * spacing - edgeX;
  }
  if (HANDLE_MOVES_NORTH.has(handle) || HANDLE_MOVES_SOUTH.has(handle)) {
    const edgeY = HANDLE_MOVES_NORTH.has(handle)
      ? originalBounds.y
      : originalBounds.y + originalBounds.height;
    dy = Math.round((edgeY + delta.y) / spacing) * spacing - edgeY;
  }
  return { x: dx, y: dy };
};

/**
 * Snap a freshly-drawn shape's bounds so both corners land on the grid.
 * Width / height stay non-negative (the bounds are already normalised
 * by the machine, but rounding can never make them negative since both
 * corners round independently).
 */
export const snapCreateBounds = (bounds: Bounds, spacing: number): Bounds => {
  const tl = snapPointToGrid({ x: bounds.x, y: bounds.y }, spacing);
  const br = snapPointToGrid(
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    spacing,
  );
  return {
    x: tl.x,
    y: tl.y,
    width: Math.max(0, br.x - tl.x),
    height: Math.max(0, br.y - tl.y),
  };
};
