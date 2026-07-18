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

/**
 * Intrinsic pixel size of a drawable image source, or `null` when it can't be
 * determined. Handles the differing width/height accessors of the DOM image
 * types (`naturalWidth` for `<img>`, `videoWidth` for `<video>`, plain
 * `width`/`height` for bitmaps / canvases). Needed to turn a normalised crop
 * (fractions) into a pixel source rectangle for `ctx.drawImage`.
 */
export const intrinsicImageSize = (
  source: CanvasImageSource,
): { readonly width: number; readonly height: number } | null => {
  const s = source as {
    naturalWidth?: number;
    naturalHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
    width?: number | { baseVal?: unknown };
    height?: number | { baseVal?: unknown };
  };
  if (typeof s.naturalWidth === "number" && s.naturalWidth > 0) {
    return { width: s.naturalWidth, height: s.naturalHeight ?? s.naturalWidth };
  }
  if (typeof s.videoWidth === "number" && s.videoWidth > 0) {
    return { width: s.videoWidth, height: s.videoHeight ?? s.videoWidth };
  }
  if (typeof s.width === "number" && s.width > 0 && typeof s.height === "number") {
    return { width: s.width, height: s.height };
  }
  return null;
};

/**
 * Warn (once per distinct kind) when an image draw is skipped because
 * the handle isn't drawable. Throttled by a module-level `Set` so a
 * per-frame render loop doesn't spam the console — but the host still
 * sees that an image failed to render and the likely cause.
 */
const warnedImageKinds = new Set<string>();

export const warnSkippedImage = (value: unknown): void => {
  if (typeof console === "undefined") return;
  const kind =
    typeof value === "string"
      ? value.startsWith("blob:")
        ? "dead-blob-url"
        : "string-src"
      : value === null || value === undefined
        ? "empty"
        : "stale-object"; // e.g. a {} from a serialised <img>
  if (warnedImageKinds.has(kind)) return;
  warnedImageKinds.add(kind);

  console.warn(
    `[renderer] skipped a non-drawable image source (kind: ${kind}). ` +
      "The shape's image handle isn't a live HTMLImageElement / canvas / " +
      "bitmap — likely a scene restored from storage where the <img> was " +
      "lost (metadata.image) and src is a dead blob: URL. The image won't " +
      "render until rehydrated from Scene.files.",
  );
};
