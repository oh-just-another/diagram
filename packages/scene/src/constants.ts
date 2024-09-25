/**
 * Tunable thresholds for the scene-level helpers (snap engine, hit-test
 * cheap-cull). Keep magic numbers here so hosts can re-tune the engine
 * without touching the algorithm code.
 */

/**
 * Half-side of the bounding box used by `isProbeNearShape` to cheap-cull
 * snap candidates. Shapes farther than this from the probe (plus the
 * snap threshold cushion) are skipped without the full anchor walk.
 *
 * The default of 1000 world units covers any typical editor shape; bump
 * it if hosts work with very large diagrams where the cheap-cull starts
 * to over-prune real candidates.
 */
export const SNAP_PROBE_CULL_RADIUS = 1000;
