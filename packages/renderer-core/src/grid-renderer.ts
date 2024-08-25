import { getScreenToWorld, getWorldToScreen, type Scene } from "@oh-just-another/scene";
import { matrix } from "@oh-just-another/math";
import type { RenderTarget } from "./render-target.js";

export interface RenderGridOptions {
  /** Colour of the minor lines (drawn every `gridSize`). Default `#eee`. */
  readonly minorStroke?: string;
  /** Colour of the major lines (drawn every `majorEvery` cells). Default `#ddd`. */
  readonly majorStroke?: string;
  /**
   * Draw a thick line every `majorEvery` cells. Default 10 → thick lines
   * at world coords 0, ±10·gridSize, ±20·gridSize, ...
   */
  readonly majorEvery?: number;
  /**
   * Hide the grid when the spacing in screen pixels falls below this
   * threshold. Default 4px — at that point lines collide visually.
   * Set to `0` to always draw the grid (rare).
   */
  readonly hideAtScreenSpacing?: number;
  /** Skip the implicit `target.clear()` before drawing. Default `false`. */
  readonly skipClear?: boolean;
}

/**
 * Paint a two-tier grid covering the visible viewport. Driven entirely by
 * `scene.viewport.gridSize` (no draw when unset) and zoom-aware — the
 * spacing in screen pixels stays meaningful regardless of zoom level.
 *
 * Designed to render onto a dedicated background layer. The default
 * behaviour clears the target first; pass `skipClear` if you composite
 * the grid onto a layer that already has content.
 */
export const renderGrid = (
  scene: Scene,
  target: RenderTarget,
  options: RenderGridOptions = {},
): void => {
  if (!options.skipClear) target.clear();

  const gridSize = scene.viewport.gridSize;
  if (!gridSize || gridSize <= 0) return;

  const majorEvery = options.majorEvery ?? 10;
  const minorStroke = options.minorStroke ?? "#eee";
  const majorStroke = options.majorStroke ?? "#ddd";
  const hideThreshold = options.hideAtScreenSpacing ?? 4;

  const zoom = scene.viewport.zoom;
  const screenSpacing = gridSize * zoom;
  if (screenSpacing < hideThreshold) return; // too dense to be useful

  // Visible world rectangle: invert the viewport transform onto the four
  // corners of the screen. With rotation == 0 (the common case) the
  // result is axis-aligned; we conservatively AABB it.
  const { width, height } = target.size;
  const s2w = getScreenToWorld(scene.viewport);
  const corners = [
    matrix.applyToPoint(s2w, { x: 0, y: 0 }),
    matrix.applyToPoint(s2w, { x: width, y: 0 }),
    matrix.applyToPoint(s2w, { x: width, y: height }),
    matrix.applyToPoint(s2w, { x: 0, y: height }),
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of corners) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  // Pad one cell so partially-visible lines on the edges still draw.
  minX = Math.floor(minX / gridSize) * gridSize - gridSize;
  maxX = Math.ceil(maxX / gridSize) * gridSize + gridSize;
  minY = Math.floor(minY / gridSize) * gridSize - gridSize;
  maxY = Math.ceil(maxY / gridSize) * gridSize + gridSize;

  target.save();
  target.setTransform(getWorldToScreen(scene.viewport));
  // Lines are 1 screen pixel — scale down by zoom so the stroke width
  // stays constant on screen.
  const lineWidth = 1 / zoom;

  // Minor lines (skip the cells that are also major — we draw those last
  // so they sit on top).
  target.setStroke(minorStroke);
  target.setStrokeWidth(lineWidth);
  target.setDashArray(null);
  target.beginPath();
  for (let x = minX; x <= maxX; x += gridSize) {
    if (isMajor(x, gridSize, majorEvery)) continue;
    target.moveTo(x, minY);
    target.lineTo(x, maxY);
  }
  for (let y = minY; y <= maxY; y += gridSize) {
    if (isMajor(y, gridSize, majorEvery)) continue;
    target.moveTo(minX, y);
    target.lineTo(maxX, y);
  }
  target.stroke();

  // Major lines on top.
  target.setStroke(majorStroke);
  target.setStrokeWidth(lineWidth);
  target.beginPath();
  for (let x = minX; x <= maxX; x += gridSize) {
    if (!isMajor(x, gridSize, majorEvery)) continue;
    target.moveTo(x, minY);
    target.lineTo(x, maxY);
  }
  for (let y = minY; y <= maxY; y += gridSize) {
    if (!isMajor(y, gridSize, majorEvery)) continue;
    target.moveTo(minX, y);
    target.lineTo(maxX, y);
  }
  target.stroke();
  target.restore();
};

const isMajor = (coord: number, gridSize: number, majorEvery: number): boolean => {
  const cellIndex = Math.round(coord / gridSize);
  return cellIndex % majorEvery === 0;
};
