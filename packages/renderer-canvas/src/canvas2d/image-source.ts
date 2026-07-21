// Single implementation lives in renderer-core (element renderers need it
// too, to distinguish "rehydration pending" from "permanently broken");
// re-exported here for this package's backends.
export { isDrawableImageSource } from "@oh-just-another/renderer-core";

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
      "bitmap and it has no Scene.files bytes to rehydrate from (shapes " +
      "with a fileId are skipped silently while rehydration is in flight) — " +
      "the image will stay blank.",
  );
};
