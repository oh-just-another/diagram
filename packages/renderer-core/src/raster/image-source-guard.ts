/**
 * Runtime guard: is `value` an actual drawable image source that
 * `ctx.drawImage` / `gl.texImage2D` will accept?
 *
 * Needed because a deserialized scene can carry a **garbage**
 * `metadata.image`: a live `<img>` DOM element serialises to `{}`
 * via `JSON.stringify`, so a scene restored from localStorage has
 * `metadata.image === {}` — a truthy object that passes a naive
 * `typeof === "object"` check but throws inside `drawImage`
 * ("provided value is not of type …") / `texImage2D` ("overload
 * resolution failed").
 *
 * The check is environment-safe: each constructor is probed for
 * existence first (workers / SSR / older browsers may lack some),
 * so it never throws on a missing global. A bare `{}` matches none
 * of them and is rejected.
 *
 * Single implementation for the whole repo — element renderers
 * (renderer-core), backends (renderer-canvas) and scene rehydration
 * (state) all import it from here.
 */
const DRAWABLE_CTOR_NAMES = [
  "HTMLImageElement",
  "HTMLCanvasElement",
  "HTMLVideoElement",
  "ImageBitmap",
  "OffscreenCanvas",
  "SVGImageElement",
  "VideoFrame",
] as const;

export const isDrawableImageSource = (value: unknown): value is CanvasImageSource => {
  if (typeof value !== "object" || value === null) return false;
  const g = globalThis as Record<string, unknown>;
  for (const name of DRAWABLE_CTOR_NAMES) {
    const ctor = g[name];
    if (
      typeof ctor === "function" &&
      value instanceof (ctor as new (...args: never[]) => unknown)
    ) {
      return true;
    }
  }
  return false;
};
