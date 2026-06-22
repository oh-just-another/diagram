import { bounds as B } from "@oh-just-another/math";
import {
  getElementWorldBounds,
  panBy as viewportPanBy,
  resize as viewportResize,
  zoomAt as viewportZoomAt,
  type GridStyle,
  type Scene,
} from "@oh-just-another/scene";
import type { Bounds, Vec2 } from "@oh-just-another/types";
import { MAX_ZOOM, MIN_ZOOM } from "../../constants.js";

const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Shift the camera by a screen-space delta. Returns the next scene, or
 * `null` for a zero-delta no-op. Viewport state is editor-local —
 * caller does not record this in history.
 */
export const computePan = (scene: Scene, deltaScreen: Vec2): Scene | null => {
  if (deltaScreen.x === 0 && deltaScreen.y === 0) return null;
  return { ...scene, viewport: viewportPanBy(scene.viewport, deltaScreen) };
};

/**
 * Multiplicative zoom around a world-space anchor. The anchor stays
 * under the same screen pixel. Result is clamped to `[MIN_ZOOM,
 * MAX_ZOOM]`; a zero-effect call returns `null`.
 */
export const computeZoomAt = (scene: Scene, factor: number, anchorWorld: Vec2): Scene | null => {
  const currentZoom = scene.viewport.zoom;
  const targetZoom = clampZoom(currentZoom * factor);
  const effectiveFactor = targetZoom / currentZoom;
  if (effectiveFactor === 1) return null;
  return {
    ...scene,
    viewport: viewportZoomAt(scene.viewport, effectiveFactor, anchorWorld),
  };
};

/**
 * Reset zoom to 1.0 around the viewport center — the world point
 * currently under the screen center stays centered, only the scale
 * changes. Returns `null` when already at zoom 1.
 */
export const computeResetZoom = (scene: Scene): Scene | null => {
  const vp = scene.viewport;
  if (vp.zoom === 1) return null;
  const centerWorld = {
    x: vp.pan.x + vp.size.width / 2 / vp.zoom,
    y: vp.pan.y + vp.size.height / 2 / vp.zoom,
  };
  return { ...scene, viewport: viewportZoomAt(vp, 1 / vp.zoom, centerWorld) };
};

/**
 * Fit the camera to an arbitrary world `bounds` with `padding` screen
 * px on each side. Returns `null` when the viewport or bounds are
 * degenerate. Shared by zoom-to-fit (all content) and
 * zoom-to-selection.
 */
export const computeZoomToBounds = (
  scene: Scene,
  bounds: Bounds,
  padding: number,
): Scene | null => {
  const vp = scene.viewport;
  if (vp.size.width <= 0 || vp.size.height <= 0) return null;
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const availW = vp.size.width - padding * 2;
  const availH = vp.size.height - padding * 2;
  if (availW <= 0 || availH <= 0) return null;
  const zoom = clampZoom(Math.min(availW / bounds.width, availH / bounds.height));
  const centerWorld = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const pan = {
    x: centerWorld.x - vp.size.width / 2 / zoom,
    y: centerWorld.y - vp.size.height / 2 / zoom,
  };
  return { ...scene, viewport: { ...vp, zoom, pan } };
};

export const computeZoomToFit = (scene: Scene, padding: number): Scene | null => {
  if (scene.elements.size === 0) return null;
  let combined: Bounds | null = null;
  for (const s of scene.elements.values()) {
    const b = getElementWorldBounds(s);
    combined = combined ? B.union(combined, b) : b;
  }
  if (!combined) return null;
  return computeZoomToBounds(scene, combined, padding);
};

/**
 * Update the camera's screen-pixel size. Returns `null` when size is
 * unchanged.
 */
export const computeViewportResize = (
  scene: Scene,
  width: number,
  height: number,
): Scene | null => {
  const vp = scene.viewport;
  if (vp.size.width === width && vp.size.height === height) return null;
  return { ...scene, viewport: viewportResize(vp, width, height) };
};

/**
 * Merge a partial grid update (`enabled` and/or `style` and/or `snap`).
 * Returns `null` when nothing actually changed. Grid settings are view
 * preferences — caller doesn't touch history.
 */
export const computeSetGrid = (
  scene: Scene,
  patch: { enabled?: boolean; style?: GridStyle; snap?: boolean },
): Scene | null => {
  const vp = scene.viewport;
  const nextEnabled = patch.enabled ?? vp.gridEnabled;
  const nextStyle = patch.style ?? vp.gridStyle;
  const nextSnap = patch.snap ?? vp.snapToGrid;
  if (nextEnabled === vp.gridEnabled && nextStyle === vp.gridStyle && nextSnap === vp.snapToGrid) {
    return null;
  }
  const nextViewport: typeof vp = {
    ...vp,
    gridEnabled: nextEnabled,
    ...(nextStyle === undefined ? {} : { gridStyle: nextStyle }),
    ...(nextSnap === undefined ? {} : { snapToGrid: nextSnap }),
  };
  return { ...scene, viewport: nextViewport };
};
