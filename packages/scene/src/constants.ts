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

/**
 * Padding (world units) the elbow router inflates obstacle bboxes
 * by before searching. Larger values keep edges visibly clear of
 * shapes; smaller values let the router squeeze through tight
 * spaces. 20 px matches the gridSize default for diagrams that
 * snap to a 20-unit grid.
 */
export const ELBOW_OBSTACLE_MARGIN = 20;

/**
 * Epsilon used to decide whether an axis-aligned segment runs
 * *along* an obstacle boundary (allowed) or *through* it (blocked).
 * A degenerate small value catches floating-point fuzz from
 * `inflate` arithmetic without admitting real crossings.
 */
export const ELBOW_OBSTACLE_INTERIOR_EPSILON = 0.5;

/**
 * --- Roundness (Style.roundness) ---
 *
 * Adaptive radius: pick a fixed radius for shapes bigger than the cutoff,
 * scale proportionally for smaller ones so the corner doesn't dominate.
 * 32 px / 0.25 looks rounded without becoming a capsule across the
 * realistic shape-size range.
 */

/** Fixed pixel radius used by adaptive rounding for shapes ≥ cutoff. */
export const ADAPTIVE_CORNER_RADIUS = 32;

/**
 * Proportional radius (0..1 of the smaller side) used by adaptive
 * rounding for shapes below the cutoff, and the fall-through when
 * `Roundness.value` is omitted but the type is `round`.
 */
export const PROPORTIONAL_CORNER_RADIUS = 0.25;
