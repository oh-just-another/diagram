import type { Scene } from "@oh-just-another/scene";
import {
  renderSceneToSvg as svgRender,
  type RenderSceneToSvgOptions,
} from "@oh-just-another/renderer-svg";
import { parseScene } from "@oh-just-another/serialization";

/**
 * Render a `Scene` to an SVG document string. Synchronous, pure JS, ~100 KB
 * of dependencies — the recommended path when you only need vector output.
 *
 * Accepts either an in-memory `Scene` or a JSON document — the latter is
 * parsed with `@serialization`'s validator before rendering.
 */
export const renderToSvg = (
  scene: Scene | string,
  options: RenderSceneToSvgOptions = {},
): string => {
  const resolved = typeof scene === "string" ? parseScene(scene) : scene;
  return svgRender(resolved, options);
};

export type { RenderSceneToSvgOptions };
