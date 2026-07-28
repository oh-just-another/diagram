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
 * Background glyph-baking pacing. One WASM MSDF bake costs ~10–15 ms, so
 * the drain loop is TIME-budgeted, not count-budgeted:
 * - `WEBGL2_ATLAS_BAKE_BUDGET_MS` — max main-thread time per slice
 *   (keeps 60 fps interaction; reasonable range 4–10).
 * - `WEBGL2_ATLAS_BAKE_REST_MS` — pause between slices so input and
 *   rAF frames interleave (reasonable range 16–100).
 */
export const WEBGL2_ATLAS_BAKE_BUDGET_MS = 6;
export const WEBGL2_ATLAS_BAKE_REST_MS = 32;

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
 * Cap applied to `window.devicePixelRatio` when sizing canvas bitmaps
 * (`setupHiDpi`, `createLayeredSurface`). Mobile / hi-end displays report
 * DPR 3–4; rendering the full ratio quadruples-to-sixteenfolds the pixel
 * fill cost per layer for visual gains that are imperceptible in a
 * diagram editor (thin strokes, flat fills). Capping at 2 keeps bitmap
 * memory and raster time bounded — text and hairlines render very
 * slightly softer on DPR-3 devices. Range: 1–4; hosts needing exact
 * native sharpness can raise it via `CreateLayeredSurfaceOptions.maxDpr`
 * or by passing an explicit `dpr` to `setupHiDpi`.
 */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/**
 * LRU cap on the Loop-Blinn triangulation cache in `webgl2-curve.ts`.
 * Keyed by curve control-point content (renderers emit paths in
 * element-local coordinates, so identical geometry — e.g. every
 * same-size rounded rect — shares one entry, and pan / zoom / drag
 * never invalidate it: the transform is applied in the vertex shader).
 *
 * Each entry stores the packed positions + uvs plus the key floats —
 * a rounded rect (4 triangles) is ≈ 500 bytes, so the cap bounds the
 * cache at a few MB worst-case. On overflow the least-recently-drawn
 * geometry is evicted and re-triangulated on next draw (cheap, no GPU
 * resources involved). Range: 512–16384.
 */
export const WEBGL2_CURVE_TRIANGULATION_CACHE_CAP = 4096;

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

/**
 * Initial per-target capacity, in instances, of the sharp-rect instance
 * batcher (`webgl2-rect-batch.ts` `RectBatch`). One frame's worth of
 * same-run rect fills packs into this without a grow; capacity doubles
 * on demand and never shrinks. 256 covers typical grid / background
 * scenes at ~10 KB (40 bytes/instance). Range: 64–4096.
 */
export const INITIAL_RECT_BATCH_INSTANCES = 256;

/**
 * LRU cap on the per-atlas MSDF run-width memo (`webgl2-msdf-text.ts`).
 * The em-width of a text run (Σ advance/unitsPerEm) is immutable once its
 * glyphs are cached, so it is memoized keyed by `(fontId, text)`: a
 * repeat `measureText`, or a `measureText` after the same string was
 * drawn, returns in O(1) instead of re-walking the codepoints. Caret
 * positioning and selection geometry call `measureText` on the same
 * label many times per frame, so the hit rate is high.
 *
 * Each entry is a single number keyed by the run string — cheap. 1024
 * covers a large editing session's distinct labels with margin; on
 * overflow the least-recently-measured run is evicted and re-walked on
 * next measure (cheap, no GPU resources). Range: 256–8192.
 */
export const WEBGL2_MSDF_RUN_WIDTH_CACHE_CAP = 1024;
