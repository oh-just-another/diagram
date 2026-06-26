/**
 * The fonts the editor ships and draws with — Roboto (sans), PT Serif
 * (serif) and Roboto Mono (mono). Bundling them means every render backend
 * (Canvas2D, WebGL2/MSDF, the offscreen worker) measures and draws the same
 * glyphs, instead of WebGL2 using the embedded font while Canvas2D falls back
 * to whatever the OS resolves for the requested family.
 */

/** The three bundled font families. */
export const FONT_SANS = "Roboto";
export const FONT_SERIF = "PT Serif";
export const FONT_MONO = "Roboto Mono";

/**
 * Map a CSS font-family stack to the bundled family that backs it. Mirrors
 * the resolution the WASM shaper uses, so Canvas2D and WebGL2 pick the same
 * face: `mono` wins, then `sans` (so `sans-serif` stays sans), then a
 * serif-ish keyword, else sans.
 */
export const resolveBundledFamily = (cssFamily: string): string => {
  const f = cssFamily.toLowerCase();
  if (f.includes("mono")) return FONT_MONO;
  if (f.includes("sans")) return FONT_SANS;
  if (f.includes("serif") || f.includes("slab") || f.includes("georgia") || f.includes("times")) {
    return FONT_SERIF;
  }
  return FONT_SANS;
};

interface FaceSpec {
  readonly family: string;
  readonly weight: "400" | "700";
  readonly style: "normal" | "italic";
  /** Built with a static `new URL(...)` literal so bundlers emit the asset. */
  readonly url: URL;
}

// Each `new URL` must be a static literal — a dynamic path (template string)
// isn't seen by bundler asset pipelines and would 404.
const FACES: readonly FaceSpec[] = [
  {
    family: FONT_SANS,
    weight: "400",
    style: "normal",
    url: new URL("../fonts/Roboto-Regular.woff2", import.meta.url),
  },
  {
    family: FONT_SANS,
    weight: "700",
    style: "normal",
    url: new URL("../fonts/Roboto-Bold.woff2", import.meta.url),
  },
  {
    family: FONT_SANS,
    weight: "400",
    style: "italic",
    url: new URL("../fonts/Roboto-Italic.woff2", import.meta.url),
  },
  {
    family: FONT_SANS,
    weight: "700",
    style: "italic",
    url: new URL("../fonts/Roboto-BoldItalic.woff2", import.meta.url),
  },
  {
    family: FONT_SERIF,
    weight: "400",
    style: "normal",
    url: new URL("../fonts/PTSerif-Regular.woff2", import.meta.url),
  },
  {
    family: FONT_SERIF,
    weight: "700",
    style: "normal",
    url: new URL("../fonts/PTSerif-Bold.woff2", import.meta.url),
  },
  {
    family: FONT_SERIF,
    weight: "400",
    style: "italic",
    url: new URL("../fonts/PTSerif-Italic.woff2", import.meta.url),
  },
  {
    family: FONT_SERIF,
    weight: "700",
    style: "italic",
    url: new URL("../fonts/PTSerif-BoldItalic.woff2", import.meta.url),
  },
  {
    family: FONT_MONO,
    weight: "400",
    style: "normal",
    url: new URL("../fonts/RobotoMono-Regular.woff2", import.meta.url),
  },
  {
    family: FONT_MONO,
    weight: "700",
    style: "normal",
    url: new URL("../fonts/RobotoMono-Bold.woff2", import.meta.url),
  },
  {
    family: FONT_MONO,
    weight: "400",
    style: "italic",
    url: new URL("../fonts/RobotoMono-Italic.woff2", import.meta.url),
  },
  {
    family: FONT_MONO,
    weight: "700",
    style: "italic",
    url: new URL("../fonts/RobotoMono-BoldItalic.woff2", import.meta.url),
  },
];

export interface FontScope {
  readonly fonts?: {
    add(font: FontFace): void;
    has(font: FontFace): boolean;
  };
}

/**
 * Load and register the bundled fonts into a scope's font set — pass the
 * `window` on the main thread and the worker's `self` inside a render worker
 * (both expose `.fonts`). Idempotent and resolves once every face is ready,
 * so callers can render crisp text after it settles. A no-op where the
 * `FontFace` API is unavailable (older runtimes / SSR).
 */
export const registerBundledFonts = async (
  scope: FontScope = globalThis as FontScope,
): Promise<void> => {
  const set = scope.fonts;
  if (!set || typeof FontFace === "undefined") return;
  // `allSettled` so one missing face doesn't block the rest from loading.
  await Promise.allSettled(
    FACES.map(async (f) => {
      const face = new FontFace(f.family, `url(${f.url.href})`, {
        weight: f.weight,
        style: f.style,
      });
      await face.load();
      set.add(face);
    }),
  );
};
