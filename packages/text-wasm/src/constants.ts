/**
 * Per-package constants — adjustable defaults for the WASM text
 * shaper. Tuned conservatively for browsers; hosts override via
 * `WasmTextShaper` constructor options.
 */

/**
 * Fallback advance width (CSS px) for shaper queries that arrive
 * before the WASM module finishes loading. Sized to roughly match
 * `0.55 * fontSize` for proportional fonts. Returned as
 * `text.length * (fontSize * FALLBACK_ADVANCE_FACTOR)` so layout
 * stays roughly proportional during the warm-up window.
 */
export const FALLBACK_ADVANCE_FACTOR = 0.55;

/**
 * LRU cap for the measure cache (entries, not bytes). Each entry
 * is a small object — a few hundred bytes — so 10k entries cost
 * ≤ ~4 MB. Hosts hosting larger documents (think 100k labels)
 * should raise via constructor options.
 */
export const MEASURE_CACHE_SIZE = 10_000;
