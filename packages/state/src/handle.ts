import type { Bounds, Vec2 } from "@oh-just-another/types";
import { vec2 } from "@oh-just-another/math";
import {
  getAnchorOutwardNormal,
  getAnchorWorld,
  getElementLocalBounds,
  type AnchorRef,
  type ElementBase,
} from "@oh-just-another/scene";
import { HANDLE_HIT_SLOP, HANDLE_OUTSET, HANDLE_SIZE, ROTATE_HANDLE_OFFSET } from "./constants.js";

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
 * An oriented selection frame: an axis-aligned `bounds` rectangle expressed in
 * a frame rotated `rotation` radians (CCW) about `pivot` (world). For a single
 * rotated shape the frame hugs the shape — so the selection box, resize handles
 * and rotate grip turn with it. For groups / multi-selection it degenerates to
 * the world AABB (`rotation: 0`), where every helper below is the identity in
 * the rotated axis and behaves exactly like the old AABB chrome.
 */
export interface SelectionFrame {
  /** Axis-aligned box in the (un-rotated) frame coordinates. */
  readonly bounds: Bounds;
  /** Frame rotation in radians, CCW. */
  readonly rotation: number;
  /** World point the frame rotates about (the renderer's pivot). */
  readonly pivot: Vec2;
}

/** Map a point from frame coordinates to world (rotate about the pivot). */
const frameToWorld = (frame: SelectionFrame, p: Vec2): Vec2 =>
  frame.rotation === 0 ? p : vec2.rotateAround(p, frame.pivot, frame.rotation);

/** Map a world point into the frame's (un-rotated) coordinates. */
const worldToFrame = (frame: SelectionFrame, w: Vec2): Vec2 =>
  frame.rotation === 0 ? w : vec2.rotateAround(w, frame.pivot, -frame.rotation);

/**
 * Selection frame hugging a single shape: the shape's scaled local footprint,
 * rotated about its `position` (the renderer's pivot). Reuses the shape's own
 * transform so the box / handles align pixel-exact with the rendered body, and
 * non-uniform / negative `scale` (flip) is folded into the axis-aligned bounds.
 */
export const shapeSelectionFrame = (shape: ElementBase): SelectionFrame => {
  const lb = getElementLocalBounds(shape);
  const x0 = lb.x * shape.scale.x;
  const x1 = (lb.x + lb.width) * shape.scale.x;
  const y0 = lb.y * shape.scale.y;
  const y1 = (lb.y + lb.height) * shape.scale.y;
  return {
    bounds: {
      x: shape.position.x + Math.min(x0, x1),
      y: shape.position.y + Math.min(y0, y1),
      width: Math.abs(x1 - x0),
      height: Math.abs(y1 - y0),
    },
    rotation: shape.rotation,
    pivot: shape.position,
  };
};

/** Axis-aligned selection frame (rotation 0) — groups / multi-selection. */
export const aabbSelectionFrame = (bounds: Bounds): SelectionFrame => ({
  bounds,
  rotation: 0,
  pivot: { x: bounds.x, y: bounds.y },
});

/** The four world corners of the frame, in `nw → ne → se → sw` order. */
export const frameCorners = (frame: SelectionFrame): readonly [Vec2, Vec2, Vec2, Vec2] => {
  const b = frame.bounds;
  return [
    frameToWorld(frame, { x: b.x, y: b.y }),
    frameToWorld(frame, { x: b.x + b.width, y: b.y }),
    frameToWorld(frame, { x: b.x + b.width, y: b.y + b.height }),
    frameToWorld(frame, { x: b.x, y: b.y + b.height }),
  ];
};

/** World centre of the frame — the natural pivot for the rotate gesture. */
export const frameCenter = (frame: SelectionFrame): Vec2 =>
  frameToWorld(frame, {
    x: frame.bounds.x + frame.bounds.width / 2,
    y: frame.bounds.y + frame.bounds.height / 2,
  });

/** World position of a resize handle on the frame (rotates with the frame). */
export const handleWorldOnFrame = (handle: HandleId, frame: SelectionFrame, zoom = 1): Vec2 =>
  frameToWorld(frame, handlePosition(handle, frame.bounds, zoom));

/**
 * Find which resize handle the world `point` is over on the frame. Inverse-
 * rotates the point into frame coordinates, then runs the flat {@link hitHandle}
 * — so corner dots / edge bands are matched in the frame's own axes.
 */
export const hitHandleOnFrame = (
  point: Vec2,
  frame: SelectionFrame,
  zoom: number,
  screenHalfSize: number = HANDLE_HIT_SLOP,
  handleSet: readonly HandleId[] = ALL_HANDLES,
): HandleId | null =>
  hitHandle(worldToFrame(frame, point), frame.bounds, zoom, screenHalfSize, handleSet);

/**
 * Per-shape-type template for where the rotate grip sits, as an {@link AnchorRef}
 * — the same vocabulary that positions a shape's custom connection points. The
 * grip is placed at this anchor and pushed `ROTATE_HANDLE_OFFSET` screen pixels
 * along the anchor's outward normal, so it rotates / scales with the shape for
 * free. Default: the bottom-left corner (`ratio { 0, 1 }`), pushed out below-left.
 */
const DEFAULT_ROTATE_ANCHOR: AnchorRef = { kind: "ratio", position: { x: 0, y: 1 } };

const rotateAnchors = new Map<string, AnchorRef>();

/** Override the rotate-grip anchor for a shape type (element template hook). */
export const registerRotateAnchor = (type: string, anchor: AnchorRef): void => {
  rotateAnchors.set(type, anchor);
};

/** The rotate-grip anchor for a shape type (falls back to bottom-left). */
export const getRotateAnchor = (type: string): AnchorRef =>
  rotateAnchors.get(type) ?? DEFAULT_ROTATE_ANCHOR;

/**
 * World position of the rotate grip for a single shape: the template anchor
 * pushed `ROTATE_HANDLE_OFFSET` screen pixels along its outward normal. Both
 * anchor and normal come from the shape transform, so the grip turns and scales
 * with the element automatically.
 */
export const rotateGripWorld = (shape: ElementBase, zoom = 1): Vec2 => {
  const anchor = getRotateAnchor(shape.type);
  const at = getAnchorWorld(shape, anchor);
  const n = getAnchorOutwardNormal(shape, anchor);
  const o = ROTATE_HANDLE_OFFSET / zoom;
  return { x: at.x + n.x * o, y: at.y + n.y * o };
};

/**
 * World position of the rotate grip for an axis-aligned group / multi-selection
 * frame: the bottom-left corner of `b`, pushed out along the down-left diagonal.
 */
export const rotateGripForBounds = (b: Bounds, zoom = 1): Vec2 => {
  const o = (ROTATE_HANDLE_OFFSET / zoom) * Math.SQRT1_2;
  return { x: b.x - o, y: b.y + b.height + o };
};

/** True when world `point` is within grab slop of a grip at `grip`. */
export const hitRotateGrip = (
  point: Vec2,
  grip: Vec2,
  zoom: number,
  screenHalfSize: number = HANDLE_HIT_SLOP,
): boolean => {
  const slop = screenHalfSize / zoom;
  return Math.abs(point.x - grip.x) <= slop && Math.abs(point.y - grip.y) <= slop;
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
