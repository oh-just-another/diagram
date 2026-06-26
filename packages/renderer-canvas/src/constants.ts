/**
 * Tunable thresholds for the canvas backend.
 */

/**
 * Element count above which a host that has wired up `WorkerPool` and
 * `transferCanvasToWorker` should prefer the worker-rendering path.
 * Below this number the per-postMessage overhead dominates and a
 * main-thread render is faster.
 *
 * At 50k shapes a full-scene main-thread render at low zoom starts to
 * drop frames; below 50k the main-thread path stays within 16 ms via
 * viewport culling and ElementCache.
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

/**
 * LRU cap on the offscreen image cache shared by `RecordingTarget`
 * (main thread, identity → id) and the render worker (id → ImageBitmap).
 *
 * The offscreen backend re-renders every frame so animated GIF / video
 * frames are picked up; without this cache each frame re-posts (clones)
 * every drawn `ImageBitmap` across the worker boundary. With it, a bitmap
 * is shipped once under a stable id and later referenced by id alone —
 * the GIF adapter returns the same cached bitmap for a frame held across
 * several rAF ticks, so the per-tick redraw costs one tiny command.
 *
 * Both sides keep an LRU of identical capacity, so they evict the same
 * id in lockstep (the command stream drives both in the same order);
 * the worker also closes the evicted bitmap clone to release memory.
 *
 * 64 — a scene rarely has more than 10-20 distinct images in flight at
 * once; a 3-6x margin covers a short GIF loop's frames without thrashing.
 * On overflow the coldest image is dropped; its next draw re-ships the
 * bitmap (one extra clone) and re-inserts.
 */
export const OFFSCREEN_IMAGE_CACHE_CAP = 64;

/**
 * LRU cap on `WebGL2Target.textures` — image-source to WebGLTexture
 * cache used by `drawImage`. Each entry holds a GPU texture
 * (`width × height × 4` bytes VRAM).
 *
 * A cap plus an explicit `gl.deleteTexture` on evict makes the release
 * deterministic.
 *
 * 64 — a typical scene rarely has more than 10-20 unique images at
 * once; a 3-6x margin covers intensive editing without thrashing. On
 * overflow the coldest image textures are unloaded; the next drawImage
 * of the same image source re-uploads via `gl.texImage2D` (extra frame
 * cost).
 */
export const WEBGL2_IMAGE_TEXTURE_CACHE_CAP = 64;

/**
 * Lower bound on the polygon approximation of an ellipse. Keeps small
 * ellipses from collapsing to a coarse hexagon at far zoom. Range: 12–48.
 */
export const ELLIPSE_MIN_SEGMENTS = 24;

/**
 * Upper bound on the polygon approximation of an ellipse. Caps GPU work
 * for huge ellipses where extra segments yield invisible pixel-error
 * improvement. Range: 256–1024.
 */
export const ELLIPSE_MAX_SEGMENTS = 512;
