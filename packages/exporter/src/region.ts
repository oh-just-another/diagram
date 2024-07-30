import type { Bounds } from "@oh-just-another/types";
import type { Scene } from "@oh-just-another/scene";
import { parseScene } from "@oh-just-another/serialization";
import type { ExportRegion } from "./options.js";

/**
 * Normalise a scene argument (object or JSON string) into a real `Scene`.
 */
export const resolveScene = (scene: Scene | string): Scene => {
  return typeof scene === "string" ? parseScene(scene) : scene;
};

/**
 * Apply a crop `region` to a scene's viewport, returning a new scene whose
 * `viewport.pan` shifts world-coordinate `(region.x, region.y)` to the
 * renderer's `(0, 0)` and whose `viewport.size` matches the crop, so the
 * renderer produces an image clipped to the region.
 *
 * Returns the original scene if no region is supplied and the viewport
 * already has a non-zero size.
 */
export const sceneForRegion = (scene: Scene, region: ExportRegion | undefined): Scene => {
  if (!region) {
    // No crop: keep the scene if it has a meaningful viewport size,
    // otherwise infer one from shape bounds (whole-scene export).
    if (scene.viewport.size.width > 0 && scene.viewport.size.height > 0) return scene;
    const inferred = inferSceneSize(scene);
    return {
      ...scene,
      viewport: { ...scene.viewport, size: inferred },
    };
  }
  return {
    ...scene,
    viewport: {
      ...scene.viewport,
      pan: { x: -region.x, y: -region.y },
      size: { width: region.width, height: region.height },
    },
  };
};

/**
 * Fallback when the scene has no explicit viewport size: union of every
 * shape's `position` plus a small margin. Empty scenes fall back to
 * 800 × 600 so callers always get a non-degenerate image.
 */
const inferSceneSize = (scene: Scene): { width: number; height: number } => {
  if (scene.shapes.size === 0) return { width: 800, height: 600 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const shape of scene.shapes.values()) {
    const x = shape.position.x;
    const y = shape.position.y;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    // Shape bounds aren't available without a bounder registry; estimate
    // 100 px on each axis as a coarse guard.
    if (x + 100 > maxX) maxX = x + 100;
    if (y + 100 > maxY) maxY = y + 100;
  }
  return {
    width: Math.max(100, Math.ceil(maxX - Math.min(0, minX))),
    height: Math.max(100, Math.ceil(maxY - Math.min(0, minY))),
  };
};

/** Inner-utility — keep `_` to avoid the unused-import noise in tests. */
export const _bounds = (b: Bounds): Bounds => b;
