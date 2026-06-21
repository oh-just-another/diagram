import type { Transform, Vec2 } from "@oh-just-another/types";
import { matrix } from "@oh-just-another/math";
import { DEFAULT_GRID_SPACING } from "./constants.js";

/**
 * Visual style of the background grid (when `gridSize > 0`).
 *   `"lines"` — classic ruled grid (default; matches a standard grid).
 *   `"dots"`  — a dot at every grid intersection. Looks calmer for
 *              free-form diagramming (standard style).
 *
 * Snap behaviour is identical between styles — only the paint
 * differs.
 */
export type GridStyle = "lines" | "dots";

/**
 * Camera over the world. Stored as pan/zoom/rotation rather than a raw matrix
 * because every UI control (zoom-to-fit, hotkeys, pinch) wants these axes
 * directly; the matrix form is derivable.
 */
export interface Viewport {
  /** World coordinate at viewport (0, 0) before rotation. */
  readonly pan: Vec2;
  /** Uniform scale. 1 = native; 2 = zoomed in 2×. */
  readonly zoom: number;
  /** Rotation in radians, counter-clockwise. */
  readonly rotation: number;
  readonly size: { readonly width: number; readonly height: number };
  /**
   * Grid size in world units. When `undefined` / `0` the background
   * grid is hidden. Renderers that paint a background grid use this
   * value. Snap-to-grid uses it when present and falls back to
   * {@link DEFAULT_GRID_SPACING} when the grid is hidden but snapping
   * is still on (see {@link resolveSnapSpacing}).
   */
  readonly gridSize?: number;
  /**
   * How the grid is painted. Default `"lines"` for backwards-compat;
   * snap math doesn't read this field. Renderers fall back to lines
   * when the field is missing.
   */
  readonly gridStyle?: GridStyle;
  /**
   * Extra programmatic opt-out for snapping. `undefined` is treated as ON
   * (see {@link isSnapToGridEnabled}). Snapping additionally requires a
   * *displayed* grid: it is active only while a grid is shown
   * (`gridVisible && gridSize > 0`) — snapping to an invisible grid is
   * confusing — so this flag only matters when a grid is on.
   */
  readonly snapToGrid?: boolean;
}

/**
 * Resolve the world-unit spacing snap-to-grid should round to. Uses the
 * visible `gridSize` when set, otherwise the {@link DEFAULT_GRID_SPACING}
 * fallback — so snapping keeps working when the grid is hidden.
 */
export const resolveSnapSpacing = (viewport: Viewport): number =>
  viewport.gridSize && viewport.gridSize > 0 ? viewport.gridSize : DEFAULT_GRID_SPACING;

/**
 * Whether snap-to-grid is enabled for this viewport. `undefined`
 * (legacy / fresh documents) counts as ON — the product default.
 */
export const isSnapToGridEnabled = (viewport: Viewport): boolean => viewport.snapToGrid ?? true;

export const DEFAULT_VIEWPORT: Viewport = Object.freeze({
  pan: { x: 0, y: 0 },
  zoom: 1,
  rotation: 0,
  size: { width: 0, height: 0 },
  // Grid is ON by default — a positive `gridSize` is what `renderGrid` paints
  // AND what snap-to-grid keys off (snap is active only while a grid is shown).
  // Tune the default spacing in `constants.ts` (`DEFAULT_GRID_SPACING`); pass a
  // scene with `gridSize: 0` (or omit it) for a gridless, snap-free canvas.
  gridSize: DEFAULT_GRID_SPACING,
});

/** World → screen transform. */
export const getWorldToScreen = (viewport: Viewport): Transform => {
  // Order: world point → translate by -pan → rotate → scale.
  const translate = matrix.translation(-viewport.pan.x, -viewport.pan.y);
  const rotate = matrix.rotation(viewport.rotation);
  const scale = matrix.scaling(viewport.zoom);
  return matrix.multiply(scale, matrix.multiply(rotate, translate));
};

/** Screen → world transform (inverse of `getWorldToScreen`). */
export const getScreenToWorld = (viewport: Viewport): Transform =>
  matrix.inverse(getWorldToScreen(viewport));

/**
 * Pan the camera by a screen-space delta. Most useful for drag handlers that
 * report pixel deltas; the delta is divided by `zoom` so panning by 1 screen
 * pixel moves the world by 1 / zoom world units.
 */
export const panBy = (viewport: Viewport, deltaScreen: Vec2): Viewport => ({
  ...viewport,
  pan: {
    x: viewport.pan.x - deltaScreen.x / viewport.zoom,
    y: viewport.pan.y - deltaScreen.y / viewport.zoom,
  },
});

/**
 * Multiplicative zoom around a world-space anchor. The anchor stays under the
 * same screen pixel, which is what users expect from mouse-wheel zoom.
 */
export const zoomAt = (viewport: Viewport, factor: number, anchorWorld: Vec2): Viewport => {
  const newZoom = viewport.zoom * factor;
  // Adjust pan so that anchorWorld maps to the same screen point.
  return {
    ...viewport,
    zoom: newZoom,
    pan: {
      x: anchorWorld.x - (anchorWorld.x - viewport.pan.x) / factor,
      y: anchorWorld.y - (anchorWorld.y - viewport.pan.y) / factor,
    },
  };
};

export const resize = (viewport: Viewport, width: number, height: number): Viewport => ({
  ...viewport,
  size: { width, height },
});
