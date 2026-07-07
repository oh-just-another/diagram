import { FALLBACK_SCENE_HEIGHT, FALLBACK_SCENE_WIDTH, type Scene } from "@oh-just-another/scene";
import type { Bounds } from "@oh-just-another/types";
import { SCENE_FIT_MARGIN } from "./constants.js";

/**
 * Fit the scene viewport around the union of `boxes` plus `SCENE_FIT_MARGIN`
 * so imports look centered when handed to the renderer without extra work.
 * Empty input falls back to `FALLBACK_SCENE_WIDTH` × `FALLBACK_SCENE_HEIGHT`.
 */
export const fitViewportToBoxes = (scene: Scene, boxes: readonly Bounds[]): Scene => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  const width =
    Number.isFinite(maxX) && Number.isFinite(minX)
      ? Math.ceil(maxX - Math.min(0, minX)) + SCENE_FIT_MARGIN
      : FALLBACK_SCENE_WIDTH;
  const height =
    Number.isFinite(maxY) && Number.isFinite(minY)
      ? Math.ceil(maxY - Math.min(0, minY)) + SCENE_FIT_MARGIN
      : FALLBACK_SCENE_HEIGHT;
  return { ...scene, viewport: { ...scene.viewport, size: { width, height } } };
};
