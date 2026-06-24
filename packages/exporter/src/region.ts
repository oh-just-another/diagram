import type { ElementId } from "@oh-just-another/types";
import {
  FALLBACK_SCENE_HEIGHT,
  FALLBACK_SCENE_WIDTH,
  getElement,
  getElementWorldBounds,
  isFrame,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { parseScene } from "@oh-just-another/serialization";
import { SHAPE_SIZE_ESTIMATE } from "./constants.js";
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
 * Clip the scene to shapes whose `frameId` matches the given id, and shift
 * the viewport so the frame's world bbox lands at the renderer's origin.
 * Returns `null` when the frame doesn't exist or isn't a `"frame"` shape,
 * letting callers fall back to `sceneForRegion`.
 *
 * Layers, edges and annotations are retained unchanged (edges with one
 * endpoint outside the frame are still rendered; the render-time
 * `viewportWorld` cull drops the off-screen parts). Only shapes are filtered.
 */
export const sceneForFrame = (scene: Scene, frameId: ElementId): Scene | null => {
  const frame = getElement(scene, frameId);
  if (!frame || !isFrame(frame)) return null;
  const bounds = getElementWorldBounds(frame);

  const elements = new Map<ElementId, Element>();
  for (const s of scene.elements.values()) {
    if (s.id === frameId) continue;
    if (s.frameId !== frameId) continue;
    elements.set(s.id, s);
  }

  return {
    ...scene,
    elements,
    viewport: {
      ...scene.viewport,
      pan: { x: -bounds.x, y: -bounds.y },
      size: { width: bounds.width, height: bounds.height },
    },
  };
};

/**
 * Fallback when the scene has no explicit viewport size: union of every
 * shape's `position` plus a small margin. Empty scenes fall back to
 * 800 × 600 so callers always get a non-degenerate image.
 */
const inferSceneSize = (scene: Scene): { width: number; height: number } => {
  if (scene.elements.size === 0)
    return { width: FALLBACK_SCENE_WIDTH, height: FALLBACK_SCENE_HEIGHT };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const shape of scene.elements.values()) {
    const x = shape.position.x;
    const y = shape.position.y;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    // Shape bounds aren't available without a bounder registry; estimate
    // a coarse per-axis size as a guard.
    if (x + SHAPE_SIZE_ESTIMATE > maxX) maxX = x + SHAPE_SIZE_ESTIMATE;
    if (y + SHAPE_SIZE_ESTIMATE > maxY) maxY = y + SHAPE_SIZE_ESTIMATE;
  }
  return {
    width: Math.max(SHAPE_SIZE_ESTIMATE, Math.ceil(maxX - Math.min(0, minX))),
    height: Math.max(SHAPE_SIZE_ESTIMATE, Math.ceil(maxY - Math.min(0, minY))),
  };
};
