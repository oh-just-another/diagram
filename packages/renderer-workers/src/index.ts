/**
 * Worker-pool primitives for off-thread rendering.
 *
 *   • `WorkerPool` — round-robin dispatch over N workers; first
 *     idle wins, queues when all are busy. Stateless w.r.t. the
 *     work — use it for fan-out scenarios (text shaping requests,
 *     bitmap tile rasterisation) where any worker can pick up
 *     any task.
 *
 *   • `LayerWorkerPool` — pins each `LayerId` to one worker for
 *     the lifetime of the layer. Required when each layer owns a
 *     transferred `OffscreenCanvas` (the canvas can only live on
 *     one worker at a time, so frame messages must always route
 *     back to the same worker).
 *
 * The kernel doesn't ship a worker script — `@renderer-canvas`
 * provides `render-worker.ts` (Canvas2D off-thread) that hosts
 * spawn via `new Worker(new URL(...), { type: "module" })`. Hosts
 * with a custom rendering pipeline (WebGL2 worker, text shaper
 * worker, raster-wasm worker) write their own and feed the spawned
 * `Worker[]` array to `new WorkerPool(...)` / `new LayerWorkerPool
 * (...)` here.
 */
export { WorkerPool } from "./worker-pool.js";
export { LayerWorkerPool } from "./layer-worker-pool.js";
