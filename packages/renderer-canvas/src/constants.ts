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

/**
 * LRU cap on `WebGL2Target.textBitmaps` — the OffscreenCanvas cache
 * used by the fallback text path (when no MSDF shaper is available:
 * Safari without WASM, older modules). Key is `text|font|color`; each
 * combination maps to one OffscreenCanvas plus one GPU texture after
 * the first drawImage.
 *
 * Without a cap the Map grows unbounded: 1000 text mutations (renaming
 * labels, comments, counter numbers) produce 1000 live GPU textures
 * plus 1000 OffscreenCanvases on the JS heap, leading to VRAM pressure
 * over a long session.
 *
 * 256 entries — a typical 200-shape scene uses 50-150 unique texts; a
 * 1.5-3x margin covers editing without thrashing. On overflow the LRU
 * evicts the least-recently-used entry: `Map.delete` plus
 * `gl.deleteTexture` for the associated WebGL texture (deterministic
 * VRAM release).
 *
 * Hosts with an MSDF shaper (WasmTextShaper) never use this path —
 * text renders through an atlas, without an OffscreenCanvas round-trip.
 */
export const WEBGL2_TEXT_BITMAP_CACHE_CAP = 256;
