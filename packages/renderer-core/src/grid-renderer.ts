import { getScreenToWorld, getWorldToScreen, type Scene } from "@oh-just-another/scene";
import { matrix } from "@oh-just-another/math";
import { GRID_COLOR } from "@oh-just-another/tokens";
import type { Bounds } from "@oh-just-another/types";
import type { RenderTarget } from "./render-target.js";

export interface RenderGridOptions {
  /** Stroke / fill colour for the grid primitives. Defaults to `GRID_COLOR` from `@oh-just-another/tokens`. */
  readonly color?: string;
  /** Skip the implicit `target.clear()` before drawing. Default `false`. */
  readonly skipClear?: boolean;
  /**
   * Override the default multi-level step ladder. Each entry says
   * "this `step` (in `gridSize` units) is fully visible once the
   * zoom reaches `mid`, fades in from `min` to `mid`, and hides
   * below `min`". Hosts use this to dial the density.
   */
  readonly levels?: readonly GridLevel[];
}

export interface GridLevel {
  /** Below this zoom the level paints nothing. */
  readonly min: number;
  /** At and above this zoom the level paints at full opacity. */
  readonly mid: number;
  /** Step in `gridSize` units (1 = the user's base grid, 4 = every 4th, …). */
  readonly step: number;
}

/**
 * modern-style multi-level grid:
 * each ladder rung is a self-similar lattice (lines or dots) at
 * `step * gridSize` spacing. As zoom changes, finer rungs fade in
 * and coarser rungs remain — so the user sees an ever-denser grid
 * when zooming in and a sparser one when zooming out, with smooth
 * opacity transitions instead of pop-in.
 *
 * Designed for a dedicated background layer (`target.clear()` ed
 * before painting unless `skipClear` is set). The fill / stroke
 * colour is one constant — opacity carries the level distinction.
 */
export const renderGrid = (
  scene: Scene,
  target: RenderTarget,
  options: RenderGridOptions = {},
): void => {
  if (!options.skipClear) target.clear();

  const gridSize = scene.viewport.gridSize;
  if (!gridSize || gridSize <= 0) return;

  const color = options.color ?? DEFAULT_GRID_COLOR;
  const levels = options.levels ?? DEFAULT_GRID_LEVELS;
  const zoom = scene.viewport.zoom;
  const { width, height } = target.size;
  if (width <= 0 || height <= 0) return;

  // Project the screen rect into world coords (axis-aligned AABB).
  const viewportWorld = computeViewportWorldRect(scene, width, height);
  if (!viewportWorld) return;

  const style = scene.viewport.gridStyle ?? "lines";

  target.save();
  target.setTransform(getWorldToScreen(scene.viewport));
  target.setDashArray(null);

  for (const level of levels) {
    const opacity = levelOpacity(zoom, level);
    if (opacity <= 0) continue;
    const step = level.step * gridSize;
    const screenSpacing = step * zoom;
    if (screenSpacing < MIN_SCREEN_SPACING_PX) continue;
    target.setOpacity(opacity);
    if (style === "dots") {
      drawDotLevel(target, viewportWorld, step, color, zoom);
    } else {
      drawLineLevel(target, viewportWorld, step, color, zoom);
    }
  }

  target.setOpacity(1);
  target.restore();
};

// --- Level rendering --------------------------------------------------------

const drawLineLevel = (
  target: RenderTarget,
  viewport: Bounds,
  step: number,
  color: string,
  zoom: number,
): void => {
  const { minX, maxX, minY, maxY } = snappedExtents(viewport, step);
  const lineWidth = 1 / zoom;
  target.setStroke(color);
  target.setStrokeWidth(lineWidth);
  target.beginPath();
  for (let x = minX; x <= maxX; x += step) {
    target.moveTo(x, minY);
    target.lineTo(x, maxY);
  }
  for (let y = minY; y <= maxY; y += step) {
    target.moveTo(minX, y);
    target.lineTo(maxX, y);
  }
  target.stroke();
};

const drawDotLevel = (
  target: RenderTarget,
  viewport: Bounds,
  step: number,
  color: string,
  zoom: number,
): void => {
  const { minX, maxX, minY, maxY } = snappedExtents(viewport, step);
  target.setStroke(null);
  target.setFill(color);
  const r = GRID_DOT_RADIUS_PX / zoom;
  const d = r * 2;
  for (let x = minX; x <= maxX; x += step) {
    for (let y = minY; y <= maxY; y += step) {
      target.beginPath();
      target.rect(x - r, y - r, d, d);
      target.fill();
    }
  }
};

// --- Helpers ----------------------------------------------------------------

const snappedExtents = (
  viewport: Bounds,
  step: number,
): { minX: number; maxX: number; minY: number; maxY: number } => ({
  minX: Math.floor(viewport.x / step) * step - step,
  maxX: Math.ceil((viewport.x + viewport.width) / step) * step + step,
  minY: Math.floor(viewport.y / step) * step - step,
  maxY: Math.ceil((viewport.y + viewport.height) / step) * step + step,
});

/**
 * Linear-fade opacity for one rung. Same shape as standard's:
 *   z ≥ mid → 1
 *   min ≤ z < mid → (z − min) / (mid − min)
 *   z < min → 0
 */
const levelOpacity = (z: number, level: GridLevel): number => {
  if (z >= level.mid) return 1;
  if (z <= level.min) return 0;
  return (z - level.min) / (level.mid - level.min);
};

const computeViewportWorldRect = (
  scene: Scene,
  width: number,
  height: number,
): Bounds | null => {
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
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

// --- Defaults ---------------------------------------------------------------

/**
 * Single grid colour used for every level. The level distinction is
 * carried by opacity, not hue — keeps the grid quiet at every zoom.
 * Sourced from `@oh-just-another/tokens` (gray.gray6).
 */
const DEFAULT_GRID_COLOR = GRID_COLOR;

/**
 * Below this on-screen spacing a level paints nothing — denser
 * rendering reads as a flat haze. Matches standard's behaviour where
 * a level is implicitly hidden once it gets too dense.
 */
const MIN_SCREEN_SPACING_PX = 4;

/**
 * Dot radius in screen pixels for `gridStyle === "dots"`. Constant
 * across zoom levels (divided by `zoom` at use site) so dots stay
 * a calm 1-pixel mark regardless of view scale.
 */
const GRID_DOT_RADIUS_PX = 1.0;

/**
 * Default ladder: 4 self-similar levels tuned for editors with a
 * 20-unit base grid. Matches the visual cadence standard uses
 * (`{ min: -1, mid: 0.15, step: 64 }` etc.) — coarsest rung is
 * always visible, finer rungs fade in around 1× zoom and below.
 */
const DEFAULT_GRID_LEVELS: readonly GridLevel[] = [
  { min: -1, mid: 0.15, step: 64 },
  { min: 0.05, mid: 0.375, step: 16 },
  { min: 0.15, mid: 1, step: 4 },
  { min: 0.7, mid: 2.5, step: 1 },
];
