/**
 * Per-package constants for the WASM rasteriser. Hosts can override
 * via constructor options.
 */

/**
 * Default tolerance (world pixels) used by `flatten` when callers
 * don't override. Lower → more polyline segments → smoother but
 * heavier. 0.5 is around "imperceptible at 1× zoom" for typical
 * diagrams.
 */
export const DEFAULT_FLATTEN_TOLERANCE = 0.5;

/**
 * Maximum recursion depth for the adaptive flatten algorithm. The
 * fallback subdivides recursively until each chord is within the
 * tolerance; this cap bounds pathological inputs (control points
 * spiralling, very long curves) so the call doesn't hang.
 */
export const MAX_FLATTEN_DEPTH = 12;
