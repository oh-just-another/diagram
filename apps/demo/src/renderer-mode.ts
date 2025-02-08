import type { RendererBackend } from "@oh-just-another/renderer-canvas";

/**
 * Active renderer backend. Three sources, checked in order:
 *
 *   1. `?renderer=canvas2d|webgl2|offscreen` in the URL (so links
 *      can pin a specific backend).
 *   2. `localStorage["diagram.demo.renderer"]` (so the dropdown's
 *      choice survives reload).
 *   3. Default `"canvas2d"`.
 *
 * `<RendererSwitcher>` updates both the URL and localStorage on
 * every change so the three sources stay in sync.
 */

export type RendererMode = RendererBackend;

const STORAGE_KEY = "diagram.demo.renderer";
const RECOGNISED: readonly RendererMode[] = ["canvas2d", "webgl2", "offscreen"];

const isMode = (value: string | null | undefined): value is RendererMode =>
  value !== null && value !== undefined && (RECOGNISED as readonly string[]).includes(value);

export const readInitialRendererMode = (): RendererMode => {
  if (typeof window === "undefined") return "canvas2d";
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("renderer");
  if (isMode(fromUrl)) return fromUrl;
  const fromStorage = window.localStorage.getItem(STORAGE_KEY);
  if (isMode(fromStorage)) return fromStorage;
  return "canvas2d";
};

export const persistRendererMode = (mode: RendererMode): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, mode);
  const url = new URL(window.location.href);
  url.searchParams.set("renderer", mode);
  // Avoid spamming the back-stack — replaceState instead of pushState.
  window.history.replaceState(null, "", url.toString());
};

export const RENDERER_LABEL: Record<RendererMode, string> = {
  canvas2d: "Canvas2D",
  webgl2: "WebGL2",
  offscreen: "OffscreenCanvas",
};

export const RENDERER_MODES: readonly RendererMode[] = RECOGNISED;
