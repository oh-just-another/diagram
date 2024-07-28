import type { Scene } from "@oh-just-another/scene";
import { CURRENT_VERSION, type SceneDocument } from "./schema.js";

/**
 * Convert an in-memory `Scene` into a plain JSON-ready document. The result is
 * deterministic for a given scene — Map iteration order follows insertion
 * order and is not sorted.
 *
 * Pure: doesn't read or write any global state.
 */
export const serializeScene = (scene: Scene): SceneDocument => ({
  format: "oh-just-another/scene",
  version: CURRENT_VERSION,
  shapes: [...scene.shapes.values()] as SceneDocument["shapes"],
  edges: [...scene.edges.values()] as SceneDocument["edges"],
  layers: [...scene.layers.values()],
  viewport: scene.viewport,
});

/**
 * Stringify a scene. Convenience for `JSON.stringify(serializeScene(s))` with
 * optional 2-space indent for human-readable output.
 */
export const stringifyScene = (scene: Scene, indent: number | null = null): string =>
  JSON.stringify(serializeScene(scene), null, indent ?? undefined);
