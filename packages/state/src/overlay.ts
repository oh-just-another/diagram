import type { Bounds, Transform, Vec2 } from "@oh-just-another/types";
import {
  getShapeWorldBounds,
  getWorldToScreen,
  type Scene,
  type ShapeBase,
} from "@oh-just-another/scene";
import { matrix } from "@oh-just-another/math";
import type { RenderTarget } from "@oh-just-another/renderer-core";
import { ALL_HANDLES, HANDLE_SIZE, handlePosition } from "./handle.js";
import type { Selection } from "./selection.js";

/**
 * Shape types the editor can resize via the 8 corner/edge handles. Other
 * shapes (polygon, path, text — they have free-form geometry) get only a
 * selection outline.
 */
const RESIZABLE_TYPES: ReadonlySet<string> = new Set(["rectangle", "ellipse", "image", "template"]);

export const isResizable = (shape: ShapeBase): boolean => RESIZABLE_TYPES.has(shape.type);

export interface OverlayStyle {
  readonly selectionStroke: string;
  readonly selectionStrokeWidth: number;
  readonly handleFill: string;
  readonly handleStroke: string;
  readonly drawingStroke: string;
  readonly drawingDash: readonly number[];
}

export const DEFAULT_OVERLAY_STYLE: OverlayStyle = {
  selectionStroke: "#1a73e8",
  selectionStrokeWidth: 1,
  handleFill: "#fff",
  handleStroke: "#1a73e8",
  drawingStroke: "#1a73e8",
  drawingDash: [4, 4],
};

/**
 * Draws selection outlines, resize handles, and the rubber-band rectangle on
 * the overlay layer. Pure draw — does not alter scene or state.
 *
 * Handles are sized in *screen* pixels regardless of zoom (4 × 4 CSS px) — the
 * caller passes the viewport so this function can compensate.
 */
export interface EdgePreview {
  /** World-space anchor on the source shape, or null for a free point. */
  readonly from: Vec2;
  readonly to: Vec2;
}

/**
 * Set of world-space points to render as port dots — used when the editor
 * wants to show "you can attach here" affordances on a hovered shape in
 * draw-edge mode.
 */
export interface PortOverlay {
  readonly worldPoints: readonly Vec2[];
  /** Highlight one of the points (the snap target). Optional. */
  readonly activeIndex?: number;
}

/**
 * Selected edge with endpoint world positions. Renderer paints small
 * handles on each end so the user can grab and re-bind them.
 */
export interface EdgeSelection {
  readonly from: Vec2;
  readonly to: Vec2;
}

export const renderOverlay = (
  scene: Scene,
  selection: Selection,
  target: RenderTarget,
  options: {
    drawingPreview?: Bounds;
    edgePreview?: EdgePreview;
    ports?: PortOverlay;
    edgeSelection?: EdgeSelection;
    /**
     * Combined world-space bounding box of a multi-selection. When set
     * the overlay paints a 1-px outline and 8 resize handles on top of
     * the per-shape selection outlines so the user can grab a group
     * handle.
     */
    groupBounds?: Bounds;
    style?: Partial<OverlayStyle>;
  } = {},
): void => {
  const style = { ...DEFAULT_OVERLAY_STYLE, ...options.style };
  target.clear();

  // World → screen transform: handles draw at constant screen size.
  const w2s = getWorldToScreen(scene.viewport);

  target.save();
  target.setTransform(matrix.IDENTITY);

  // 1. Selection outlines + handles
  for (const id of selection) {
    const shape = scene.shapes.get(id);
    if (!shape) continue;
    const worldBounds = getShapeWorldBounds(shape);
    const screenBounds = projectBounds(worldBounds, w2s);

    drawOutline(target, screenBounds, style);

    if (!isResizable(shape)) continue;

    for (const handle of ALL_HANDLES) {
      const worldPoint = handlePosition(handle, worldBounds);
      const screenPoint = matrix.applyToPoint(w2s, worldPoint);
      drawHandle(target, screenPoint, style);
    }
  }

  // 2. Rubber-band drawing preview (already in world coords if drawn before transform reset)
  if (options.drawingPreview) {
    const screenBounds = projectBounds(options.drawingPreview, w2s);
    drawDrawingPreview(target, screenBounds, style);
  }

  // 3. Edge-drawing preview — straight dashed line in screen space.
  if (options.edgePreview) {
    const from = matrix.applyToPoint(w2s, options.edgePreview.from);
    const to = matrix.applyToPoint(w2s, options.edgePreview.to);
    drawEdgePreview(target, from, to, style);
  }

  // 4. Port dots — hover affordance in draw-edge mode.
  if (options.ports && options.ports.worldPoints.length > 0) {
    for (let i = 0; i < options.ports.worldPoints.length; i++) {
      const screen = matrix.applyToPoint(w2s, options.ports.worldPoints[i]!);
      const active = options.ports.activeIndex === i;
      drawPortDot(target, screen, style, active);
    }
  }

  // 5. Selected-edge endpoint handles.
  if (options.edgeSelection) {
    const from = matrix.applyToPoint(w2s, options.edgeSelection.from);
    const to = matrix.applyToPoint(w2s, options.edgeSelection.to);
    drawEdgeEndpointHandle(target, from, style);
    drawEdgeEndpointHandle(target, to, style);
  }

  // 6. Multi-selection combined bounds — outline + 8 group handles.
  if (options.groupBounds) {
    const groupScreen = projectBounds(options.groupBounds, w2s);
    drawOutline(target, groupScreen, style);
    for (const handle of ALL_HANDLES) {
      const worldPoint = handlePosition(handle, options.groupBounds);
      const screenPoint = matrix.applyToPoint(w2s, worldPoint);
      drawHandle(target, screenPoint, style);
    }
  }

  target.restore();
};

const projectBounds = (b: Bounds, w2s: Transform): Bounds => {
  const tl = matrix.applyToPoint(w2s, { x: b.x, y: b.y });
  const br = matrix.applyToPoint(w2s, { x: b.x + b.width, y: b.y + b.height });
  const x = Math.min(tl.x, br.x);
  const y = Math.min(tl.y, br.y);
  return { x, y, width: Math.abs(br.x - tl.x), height: Math.abs(br.y - tl.y) };
};

const drawOutline = (target: RenderTarget, b: Bounds, style: OverlayStyle): void => {
  target.setStroke(style.selectionStroke);
  target.setStrokeWidth(style.selectionStrokeWidth);
  target.setDashArray(null);
  target.beginPath();
  target.rect(b.x, b.y, b.width, b.height);
  target.stroke();
};

const drawHandle = (target: RenderTarget, center: Vec2, style: OverlayStyle): void => {
  const s = HANDLE_SIZE;
  target.setFill(style.handleFill);
  target.setStroke(style.handleStroke);
  target.setStrokeWidth(1);
  target.setDashArray(null);
  target.beginPath();
  target.rect(center.x - s, center.y - s, s * 2, s * 2);
  target.fill();
  target.stroke();
};

const drawDrawingPreview = (target: RenderTarget, b: Bounds, style: OverlayStyle): void => {
  target.setStroke(style.drawingStroke);
  target.setStrokeWidth(1);
  target.setDashArray(style.drawingDash);
  target.beginPath();
  target.rect(b.x, b.y, b.width, b.height);
  target.stroke();
};

const drawEdgePreview = (target: RenderTarget, from: Vec2, to: Vec2, style: OverlayStyle): void => {
  target.setStroke(style.drawingStroke);
  target.setStrokeWidth(1.5);
  target.setDashArray(style.drawingDash);
  target.beginPath();
  target.moveTo(from.x, from.y);
  target.lineTo(to.x, to.y);
  target.stroke();
};

const drawPortDot = (
  target: RenderTarget,
  center: Vec2,
  style: OverlayStyle,
  active: boolean,
): void => {
  const radius = active ? 5 : 3.5;
  target.setStroke(style.selectionStroke);
  target.setStrokeWidth(active ? 2 : 1);
  target.setDashArray(null);
  target.setFill(active ? style.selectionStroke : style.handleFill);
  target.beginPath();
  target.ellipse(center.x, center.y, radius, radius);
  target.fill();
  target.stroke();
};

const drawEdgeEndpointHandle = (target: RenderTarget, center: Vec2, style: OverlayStyle): void => {
  const radius = 6;
  target.setStroke(style.selectionStroke);
  target.setStrokeWidth(2);
  target.setDashArray(null);
  target.setFill(style.handleFill);
  target.beginPath();
  target.ellipse(center.x, center.y, radius, radius);
  target.fill();
  target.stroke();
};
