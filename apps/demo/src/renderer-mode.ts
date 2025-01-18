/**
 * Active renderer backend chosen via build-time env var
 * (`VITE_RENDERER=canvas2d|webgl2|offscreen pnpm dev:<mode>`).
 *
 * - `"canvas2d"` (default) — main-thread Canvas2D. Full feature
 *  coverage; the well-tested path.
 * - `"webgl2"` — GPU-accelerated WebGL2 (MVP). Currently
 *  only fills solid rectangles; strokes / curves / text fall
 *  back to Canvas2D for now via runtime detection of unsupported
 *  methods.
 * - `"offscreen"` — Canvas2D running inside an OffscreenCanvas
 *  worker (infra). Main thread stays free for React
 *  updates; rendering happens off-thread. Requires the host
 *  browser to support OffscreenCanvas (Safari 16.4+; Chromium
 *  and Firefox already do).
 */
export type RendererMode = "canvas2d" | "webgl2" | "offscreen";

const ENV_RENDERER = import.meta.env.VITE_RENDERER as string | undefined;

const RECOGNISED: readonly RendererMode[] = ["canvas2d", "webgl2", "offscreen"];

export const RENDERER_MODE: RendererMode =
 RECOGNISED.includes((ENV_RENDERER as RendererMode) ?? "canvas2d")
  ? (ENV_RENDERER as RendererMode) ?? "canvas2d"
  : "canvas2d";

export const RENDERER_LABEL: Record<RendererMode, string> = {
 canvas2d: "Canvas2D",
 webgl2: "WebGL2",
 offscreen: "OffscreenCanvas",
};
