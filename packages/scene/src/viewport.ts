import type { Transform, Vec2 } from "@oh-just-another/types";
import { matrix } from "@oh-just-another/math";

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
   * Snap grid size in world units. When `undefined` the grid is hidden
   * and snap-to-grid is off. Renderers that paint a background grid use
   * the same value.
   */
  readonly gridSize?: number;
}

export const DEFAULT_VIEWPORT: Viewport = Object.freeze({
  pan: { x: 0, y: 0 },
  zoom: 1,
  rotation: 0,
  size: { width: 0, height: 0 },
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
