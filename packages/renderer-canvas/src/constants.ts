/**
 * Tunable thresholds for the canvas backend.
 */

/**
 * Shape count above which a host that has wired up `WorkerPool` and
 * `transferCanvasToWorker` should prefer the worker-rendering path.
 * Below this number the per-postMessage overhead dominates and a
 * main-thread render is faster.
 *
 * Default 50_000 — picked from benchmarks: at 50k shapes
 * the main-thread render starts to drop frames at low zoom (full
 * scene in viewport); below 50k the main-thread path fits within 16 ms
 * via viewport culling + ShapeCache.
 */
export const LARGE_SCENE_WORKER_THRESHOLD = 50_000;
