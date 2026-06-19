/**
 * Spawn the Canvas2D offscreen render worker.
 *
 * The worker entry (`./render-worker`) is a sibling module in this
 * package, referenced via `new URL(..., import.meta.url)` so the host
 * bundler emits it as a dedicated worker chunk. Keeping the factory
 * inside `renderer-canvas` means consumers construct the worker through
 * a normal package import — they never reach across package boundaries
 * with a relative path to another package's source.
 */
export const createRenderWorker = (): Worker =>
  new Worker(new URL("./render-worker.js", import.meta.url), { type: "module" });
