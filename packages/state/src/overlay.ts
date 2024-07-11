import type { Bounds, Transform, Vec2 } from "@oh-just-another/types";
import { getShapeWorldBounds, getWorldToScreen, type Scene } from "@oh-just-another/scene";
import { matrix } from "@oh-just-another/math";
import type { RenderTarget } from "@oh-just-another/renderer-core";
import { ALL_HANDLES, HANDLE_SIZE, handlePosition } from "./handle";
import type { Selection } from "./selection";

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
export const renderOverlay = (
  scene: Scene,
  selection: Selection,
  target: RenderTarget,
  options: { drawingPreview?: Bounds; style?: Partial<OverlayStyle> } = {},
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
