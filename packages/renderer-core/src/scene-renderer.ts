import {
  getLayersInOrder,
  getShapesInLayer,
  getWorldToScreen,
  type Scene,
  type ShapeBase,
} from "@oh-just-another/scene";
import type { RenderTarget } from "./render-target";
import { getShapeRenderer } from "./shape-renderer";

export interface RenderSceneOptions {
  /** Skip clearing the target before drawing. Default: false. */
  readonly skipClear?: boolean;
  /** Called for shapes whose `type` has no registered renderer. Default: ignore. */
  readonly onUnknownShape?: (shape: ShapeBase) => void;
}

/**
 * Renders the `main` z-stack of a scene onto a single target.
 *
 * Order of operations:
 *   1. Optionally clear the surface.
 *   2. Apply the scene's world-to-screen transform.
 *   3. For each visible layer (bottom → top): for each shape (bottom → top):
 *      save state, push the shape's local TRS, invoke its registered renderer.
 *
 * This function does not draw edges, selection handles, or grids — those
 * either live on different layers (`background` / `overlay`) or are added by
 * higher-level packages.
 */
export const renderScene = (
  scene: Scene,
  target: RenderTarget,
  options: RenderSceneOptions = {},
): void => {
  if (!options.skipClear) target.clear();

  target.save();
  target.setTransform(getWorldToScreen(scene.viewport));

  for (const layer of getLayersInOrder(scene)) {
    if (!layer.visible) continue;

    for (const shape of getShapesInLayer(scene, layer.id)) {
      const renderer = getShapeRenderer(shape.type);
      if (!renderer) {
        options.onUnknownShape?.(shape);
        continue;
      }

      target.save();
      target.translate(shape.position.x, shape.position.y);
      if (shape.rotation !== 0) target.rotate(shape.rotation);
      if (shape.scale.x !== 1 || shape.scale.y !== 1) {
        target.scale(shape.scale.x, shape.scale.y);
      }
      renderer(shape, target);
      target.restore();
    }
  }

  target.restore();
};
