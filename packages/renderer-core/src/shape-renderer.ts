import type { ElementBase } from "@oh-just-another/scene";
import type { RenderTarget } from "./render-target.js";

/**
 * Optional draw context passed to an {@link ElementRenderer}. Carries the
 * current view `zoom` so a renderer can draw screen-constant features (e.g. a
 * 1px hairline border that does NOT scale with zoom): a local stroke width of
 * `1 / (zoom * shape.scale)` lands at one device pixel. Optional and additive —
 * renderers that don't need it ignore the third argument, and callers that
 * can't supply it (preview / export at 1:1) may omit it.
 */
export interface ElementRenderContext {
  /** Current view scale (1.0 = 1:1). `world × zoom = screen px`. */
  readonly zoom: number;
}

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
  ctx?: ElementRenderContext,
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
