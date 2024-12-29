import type { ShapeBase } from "@oh-just-another/scene";
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
export type ShapeRenderer<S extends ShapeBase = ShapeBase> = (
  shape: S,
  target: RenderTarget,
) => void;

const registry = new Map<string, ShapeRenderer>();

/**
 * Register a renderer for a shape type. Plugins call this at module load.
 * The kernel ships renderers for every built-in shape from `@oh-just-another/scene`
 * — they are installed by `@oh-just-another/renderer-canvas` (and any other
 * backend) on import.
 */
export const registerShapeRenderer = <S extends ShapeBase>(
  type: S["type"],
  renderer: ShapeRenderer<S>,
): void => {
  registry.set(type, renderer as ShapeRenderer);
};

/** Look up a registered renderer. Returns `undefined` for unknown types. */
export const getShapeRenderer = (type: string): ShapeRenderer | undefined => registry.get(type);

/** True if a renderer is registered for `type`. */
export const hasShapeRenderer = (type: string): boolean => registry.has(type);
