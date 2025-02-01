import type { LayerId } from "@oh-just-another/types";
import { WorkerPool } from "./worker-pool.js";

/**
 * per-layer worker assignment on top of `WorkerPool`.
 *
 * The plain pool dispatches tasks round-robin to whichever worker
 * is idle. That breaks for layer rendering: each layer owns its
 * own OffscreenCanvas (transferred once during `init`), so layer L
 * must always go back to the same worker that holds its canvas.
 *
 * `LayerWorkerPool` keeps a `LayerId → workerIndex` map, picks the
 * least-busy worker the first time a layer is seen, and pins it
 * for the rest of the session. The pin is removed when the layer
 * is destroyed (`releaseLayer`) so a future layer with the same
 * id starts fresh.
 */
export class LayerWorkerPool {
 private readonly pool: WorkerPool;
 private readonly workers: readonly Worker[];
 private readonly perWorkerLoad: number[];
 private readonly assignment = new Map<LayerId, number>();

 constructor(workers: readonly Worker[]) {
  if (workers.length === 0) {
   throw new Error("LayerWorkerPool needs at least one worker");
  }
  this.workers = workers;
  this.pool = new WorkerPool(workers);
  this.perWorkerLoad = workers.map(() => 0);
 }

 /** Number of workers backing the pool. */
 get size(): number {
  return this.pool.size;
 }

 /** Layers currently pinned to a worker. */
 get assignedLayerCount(): number {
  return this.assignment.size;
 }

 /**
  * Return (and assign if missing) the worker that owns `layerId`.
  * First-time assignment picks the worker with the fewest pinned
  * layers — keeps the spread even without rebalancing live state.
  */
 workerFor(layerId: LayerId): Worker {
  const existing = this.assignment.get(layerId);
  if (existing !== undefined) return this.workers[existing]!;
  let pickIndex = 0;
  let pickLoad = this.perWorkerLoad[0]!;
  for (let i = 1; i < this.workers.length; i++) {
   if (this.perWorkerLoad[i]! < pickLoad) {
    pickIndex = i;
    pickLoad = this.perWorkerLoad[i]!;
   }
  }
  this.assignment.set(layerId, pickIndex);
  this.perWorkerLoad[pickIndex]!++;
  return this.workers[pickIndex]!;
 }

 /**
  * Submit a task pinned to `layerId`'s worker. Reuses the same
  * worker every time so the OffscreenCanvas-owning worker is the
  * one that receives the frame message.
  */
 submitForLayer<T>(layerId: LayerId, fn: (worker: Worker) => Promise<T>): Promise<T> {
  const worker = this.workerFor(layerId);
  // Bypass the round-robin pool — we want this specific worker.
  return fn(worker);
 }

 /**
  * Submit unpinned work (e.g. text shaping requests) to whichever
  * worker is idle. Use this only for tasks that don't depend on a
  * specific worker's transferred state.
  */
 submitAny<T>(fn: (worker: Worker) => Promise<T>): Promise<T> {
  return this.pool.submit(fn);
 }

 /**
  * Forget the pin for `layerId` — call when a layer is removed so
  * a future layer can claim a less-loaded worker. The underlying
  * worker keeps running; the host is expected to send the worker
  * a `dispose` message separately if it wants to free GPU memory.
  */
 releaseLayer(layerId: LayerId): void {
  const idx = this.assignment.get(layerId);
  if (idx === undefined) return;
  this.assignment.delete(layerId);
  this.perWorkerLoad[idx] = Math.max(0, this.perWorkerLoad[idx]! - 1);
 }

 /** Terminate every worker. Pool is unusable afterwards. */
 terminate(): void {
  this.pool.terminate();
  this.assignment.clear();
  for (let i = 0; i < this.perWorkerLoad.length; i++) this.perWorkerLoad[i] = 0;
 }
}
