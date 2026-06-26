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
 * Both classes take an already-spawned `Worker[]` array; the host
 * supplies its own worker script.
 */
export { WorkerPool } from "./worker-pool.js";
export { LayerWorkerPool } from "./layer-worker-pool.js";
