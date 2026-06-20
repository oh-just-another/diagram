import { getScreenToWorld, getWorldToScreen, type Scene } from "@oh-just-another/scene";
import { matrix } from "@oh-just-another/math";
import type { Bounds } from "@oh-just-another/types";
import type { RenderTarget } from "./render-target.js";
import {
  GRID_DOT_FADE_FROM_PX,
  GRID_DOT_FADE_FULL_PX,
  GRID_DOT_FILL,
  GRID_DOT_RADIUS_PX,
  GRID_LEVEL_RUNGS,
  GRID_LEVEL_SUBDIV,
  GRID_LINE_COLOR,
  GRID_LINE_FADE_FROM_PX,
  GRID_LINE_FADE_FULL_PX,
  GRID_LINE_WIDTH_PX,
  GRID_MIN_SCREEN_SPACING_PX,
} from "./constants.js";

export interface RenderGridOptions {
  /** Stroke / fill colour for the grid primitives. Defaults to `GRID_COLOR` from `@oh-just-another/tokens`. */
  readonly color?: string;
  /** Skip the implicit `target.clear()` before drawing. Default `false`. */
  readonly skipClear?: boolean;
  /**
   * Fixed multi-level step ladder. Each entry says "this `step` (in
   * `gridSize` units) is fully visible once the zoom reaches `mid`, fades
   * in from `min` to `mid`, and hides below `min`". When omitted the grid
   * uses the default DYNAMIC (infinite) ladder — see {@link computeGridRungs}
   * — which keeps subdividing at every zoom instead of bottoming out at the
   * ladder's finest rung.
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

/** One rung of the dynamic ladder: a world-space step and its opacity. */
export interface GridRung {
  /** Spacing between lines / dots, in world units. */
  readonly step: number;
  /** Paint opacity in [0, 1]. */
  readonly opacity: number;
}

/**
 * Compute the dynamic, self-similar grid ladder for a given zoom. The
 * rungs are anchored to the current zoom — the finest rung is the
 * smallest `gridSize · SUBDIV^k` (k ∈ ℤ, possibly negative → finer than
 * `gridSize`) whose on-screen spacing is at least `fadeFromPx` — so as
 * the zoom changes the whole ladder slides and a new rung always fades
 * in. Each rung's opacity ramps from `fadeFromPx` (0) to `fadeFullPx`
 * (1) of on-screen spacing. Pure / allocation-light; exported for tests.
 */
export const computeGridRungs = (
  gridSize: number,
  zoom: number,
  fadeFromPx: number,
  fadeFullPx: number,
  subdiv = GRID_LEVEL_SUBDIV,
  rungs = GRID_LEVEL_RUNGS,
): GridRung[] => {
  const out: GridRung[] = [];
  if (gridSize <= 0 || zoom <= 0) return out;
  // Screen spacing of the base (k = 0) lattice, then the smallest k whose
  // spacing clears the fade-in floor.
  const baseScreen = gridSize * zoom;
  const kMin = Math.ceil(Math.log(fadeFromPx / baseScreen) / Math.log(subdiv));
  for (let i = 0; i < rungs; i++) {
    const k = kMin + i;
    const step = gridSize * subdiv ** k;
    const screenSpacing = step * zoom;
    const opacity = Math.max(
      0,
      Math.min(1, (screenSpacing - fadeFromPx) / (fadeFullPx - fadeFromPx)),
    );
    if (opacity <= 0) continue;
    out.push({ step, opacity });
  }
  return out;
};

/**
 * Self-similar background grid. By default it paints a DYNAMIC ladder
 * (see {@link computeGridRungs}): a handful of zoom-anchored rungs, each
 * `GRID_LEVEL_SUBDIV`× the previous, so new lines / dots fade in at every
 * zoom — there's no fixed finest rung to bottom out on. Pass
 * `options.levels` for the fixed-ladder behaviour.
 *
 * Designed for a dedicated background layer (`target.clear()` ed before
 * painting unless `skipClear` is set). The fill / stroke colour is one
 * constant — opacity carries the level distinction.
 */
export const renderGrid = (
  scene: Scene,
  target: RenderTarget,
  options: RenderGridOptions = {},
): void => {
  if (!options.skipClear) target.clear();

  const gridSize = scene.viewport.gridSize;
  if (!gridSize || gridSize <= 0) return;

  const style = scene.viewport.gridStyle ?? "lines";
  const isDots = style === "dots";
  // Lines and dots default to different colours. Explicit options.color
  // still wins so hosts can fully re-skin either style.
  const color = options.color ?? (isDots ? GRID_DOT_FILL : GRID_LINE_COLOR);
  const zoom = scene.viewport.zoom;
  const { width, height } = target.size;
  if (width <= 0 || height <= 0) return;

  // Project the screen rect into world coords (axis-aligned AABB).
  const viewportWorld = computeViewportWorldRect(scene, width, height);
  if (!viewportWorld) return;

  const draw = (step: number): void => {
    if (isDots) drawDotLevel(target, viewportWorld, step, color, zoom);
    else drawLineLevel(target, viewportWorld, step, color, zoom);
  };

  target.save();
  target.setTransform(getWorldToScreen(scene.viewport));
  target.setDashArray(null);

  if (options.levels) {
    // Fixed-ladder path: opacity keyed off absolute zoom.
    for (const level of options.levels) {
      const opacity = levelOpacity(zoom, level);
      if (opacity <= 0) continue;
      const step = level.step * gridSize;
      if (step * zoom < GRID_MIN_SCREEN_SPACING_PX) continue;
      target.setOpacity(opacity);
      draw(step);
    }
  } else {
    // Default dynamic (infinite) ladder.
    const fadeFrom = isDots ? GRID_DOT_FADE_FROM_PX : GRID_LINE_FADE_FROM_PX;
    const fadeFull = isDots ? GRID_DOT_FADE_FULL_PX : GRID_LINE_FADE_FULL_PX;
    for (const rung of computeGridRungs(gridSize, zoom, fadeFrom, fadeFull)) {
      target.setOpacity(rung.opacity);
      draw(rung.step);
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
  const lineWidth = GRID_LINE_WIDTH_PX / zoom;
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
 * Linear-fade opacity for one rung.
 *   z ≥ mid → 1
 *   min ≤ z < mid → (z − min) / (mid − min)
 *   z < min → 0
 */
const levelOpacity = (z: number, level: GridLevel): number => {
  if (z >= level.mid) return 1;
  if (z <= level.min) return 0;
  return (z - level.min) / (level.mid - level.min);
};

const computeViewportWorldRect = (scene: Scene, width: number, height: number): Bounds | null => {
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
