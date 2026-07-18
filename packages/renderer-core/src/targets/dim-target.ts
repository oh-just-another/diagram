import type { RenderTarget } from "./render-target.js";

/**
 * Wrap a {@link RenderTarget} so every `setOpacity(a)` becomes
 * `setOpacity(a * factor)`, leaving all other calls untouched.
 *
 * Isolation / eraser dim works by lowering the alpha for a subset of shapes.
 * The scene renderer sets that alpha *before* the shape renderer runs, but a
 * renderer that applies the shape's own `style.opacity` calls `setOpacity`
 * absolutely — overwriting the dim, so a shape carrying an explicit opacity
 * would never dim (the eraser's "about to delete" fade silently vanished).
 * Routing the renderer through this wrapper multiplies the two instead: a
 * plain shape stays at `factor`, and a shape with `opacity` renders at
 * `opacity * factor` — dimmed *and* semi-transparent, as expected.
 *
 * One wrapper is allocated per dimmed pass (constant `factor`) and reused for
 * every dimmed shape; method lookups are memoised so the hot per-shape draw
 * loop allocates nothing.
 */
export const createDimTarget = (inner: RenderTarget, factor: number): RenderTarget => {
  const cache = new Map<PropertyKey, unknown>();
  const scaledSetOpacity = (a: number): void => {
    inner.setOpacity(a * factor);
  };
  const handler: ProxyHandler<RenderTarget> = {
    get(target, prop) {
      if (prop === "setOpacity") return scaledSetOpacity;
      if (cache.has(prop)) return cache.get(prop);
      const value: unknown = Reflect.get(target, prop);
      const resolved =
        typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      cache.set(prop, resolved);
      return resolved;
    },
  };
  return new Proxy(inner, handler);
};
