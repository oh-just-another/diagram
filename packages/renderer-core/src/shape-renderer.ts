import type { ElementBase } from "@oh-just-another/scene";
import type { RenderTarget } from "./render-target.js";

/**
 * Draws a single shape onto `target`. The shape's `position` / `rotation` /
 * `scale` have already been applied to the target — implementations draw in
 * the shape's *local* coordinate space.
 *
 * Implementations should also apply style (fill / stroke / etc.) themselves;
 * the renderer-core does not push styles globally because some shapes (e.g.
 * `text`) extend the base `Style` with overlays.
 */
export type ElementRenderer<S extends ElementBase = ElementBase> = (
  shape: S,
  target: RenderTarget,
) => void;

const registry = new Map<string, ElementRenderer>();

/**
 * Register a renderer for a shape type. Plugins call this at module load.
 * The kernel ships renderers for every built-in shape from `@oh-just-another/scene`
 * — they are installed by `@oh-just-another/renderer-canvas` (and any other
 * backend) on import.
 */
export const registerElementRenderer = <S extends ElementBase>(
  type: S["type"],
  renderer: ElementRenderer<S>,
): void => {
  registry.set(type, renderer as ElementRenderer);
};

/** Look up a registered renderer. Returns `undefined` for unknown types. */
export const getElementRenderer = (type: string): ElementRenderer | undefined => registry.get(type);

/** True if a renderer is registered for `type`. */
export const hasElementRenderer = (type: string): boolean => registry.has(type);
