/**
 * Spawn the Canvas2D offscreen render worker.
 *
 * The worker entry (`../render-worker`) lives at the package src root —
 * it is an entry point (subpath export + CDN esbuild entry) and must
 * stay there. It is referenced via `new URL(..., import.meta.url)` so
 * the host bundler emits it as a dedicated worker chunk. Keeping the
 * factory inside `renderer-canvas` means consumers construct the worker
 * through a normal package import — they never reach across package
 * boundaries with a relative path to another package's source.
 */
export const createRenderWorker = (): Worker =>
  new Worker(new URL("../render-worker.js", import.meta.url), { type: "module" });
