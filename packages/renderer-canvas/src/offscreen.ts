import { Canvas2DTarget } from "./canvas-target.js";

/**
 * Browser-feature detection. `true` when both `OffscreenCanvas` and the
 * `transferControlToOffscreen` upgrade path on `HTMLCanvasElement` are
 * available. False in Safari < 16.4 and in test environments without a
 * canvas implementation — callers should fall back to the on-main
 * `Canvas2DTarget` in that case.
 */
export const supportsOffscreenCanvas = (): boolean => {
  if (typeof OffscreenCanvas === "undefined") return false;
  if (typeof HTMLCanvasElement === "undefined") return false;
  return typeof HTMLCanvasElement.prototype.transferControlToOffscreen === "function";
};

/**
 * Build a `Canvas2DTarget` backed by a fresh `OffscreenCanvas`. The CSS
 * dimensions match the bitmap (no DPR scaling here — callers that want
 * crisp output on hi-DPI displays should size the bitmap by `dpr` and
 * pass a pre-scaled transform to draw calls).
 */
export const createOffscreenCanvas2DTarget = (
  width: number,
  height: number,
): { readonly canvas: OffscreenCanvas; readonly target: Canvas2DTarget } => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
  // The OffscreenCanvasRenderingContext2D API is a superset of the
  // 2D path / state / text methods Canvas2DTarget calls, so the cast
  // relies on structural compatibility.
  const target = new Canvas2DTarget(ctx as unknown as CanvasRenderingContext2D, width, height);
  return { canvas, target };
};

/**
 * Transfer a canvas's rendering ownership to a worker. The returned
 * `OffscreenCanvas` is now controlled by the worker (the host can no
 * longer get a 2D context on the same element). Posts the offscreen
 * to the worker via `worker.postMessage(msg, [offscreen])`.
 *
 * Throws when offscreen is unsupported — guard with
 * `supportsOffscreenCanvas()` before calling.
 */
export const transferCanvasToWorker = (
  canvas: HTMLCanvasElement,
  worker: Worker,
  initMessage: Record<string, unknown> = {},
): OffscreenCanvas => {
  if (!supportsOffscreenCanvas()) {
    throw new Error("OffscreenCanvas not supported in this environment");
  }
  const offscreen = canvas.transferControlToOffscreen();
  worker.postMessage({ type: "init", canvas: offscreen, ...initMessage }, [offscreen]);
  return offscreen;
};
