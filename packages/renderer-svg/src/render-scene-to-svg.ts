import {
  installBuiltinRenderers,
  renderEdges,
  renderScene,
  type RenderSceneOptions,
} from "@oh-just-another/renderer-core";
import type { Scene } from "@oh-just-another/scene";
import { SvgTarget } from "./svg-target.js";
import type { approxTextWidth } from "./measure-text.js";

export interface RenderSceneToSvgOptions extends RenderSceneOptions {
  /**
   * Output canvas size in CSS pixels. Defaults to the scene viewport's
   * `size`, which is what most callers want.
   */
  readonly width?: number;
  readonly height?: number;
  /** Text measurer; defaults to `approxTextWidth`. */
  readonly measureText?: typeof approxTextWidth;
  /**
   * Skip the implicit `installBuiltinRenderers()` call. Defaults to `false`.
   * Set this when you've already registered every shape renderer you need
   * (including plugin types) and don't want the kernel to overwrite them.
   */
  readonly skipInstall?: boolean;
}

/**
 * One-shot helper: render a `Scene` into an SVG document string.
 *
 * ```ts
 * import { renderSceneToSvg } from "@oh-just-another/renderer-svg";
 * await writeFile("out.svg", renderSceneToSvg(scene));
 * ```
 *
 * For lower-level access — e.g. composing multiple scenes onto the same
 * surface or controlling each draw call — instantiate `SvgTarget` directly
 * and call `renderScene(scene, target, …)` followed by `target.toSvg()`.
 */
export const renderSceneToSvg = (scene: Scene, options: RenderSceneToSvgOptions = {}): string => {
  if (!options.skipInstall) installBuiltinRenderers();

  const width = options.width ?? scene.viewport.size.width;
  const height = options.height ?? scene.viewport.size.height;
  const target = new SvgTarget({
    width,
    height,
    ...(options.measureText ? { measureText: options.measureText } : {}),
  });

  renderScene(scene, target, options);
  renderEdges(scene, target);
  return target.toSvg();
};
