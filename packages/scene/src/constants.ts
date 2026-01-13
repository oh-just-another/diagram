/**
 * Tunable thresholds for the scene-level helpers (snap engine, hit-test
 * cheap-cull). Keep magic numbers here so hosts can re-tune the engine
 * without touching the algorithm code.
 */

/**
 * Half-side of the bounding box used by `isProbeNearElement` to cheap-cull
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
 * Per-turn cost added in the elbow A* so the router minimises BENDS first,
 * distance second (lexicographic — far larger than any plausible canvas
 * distance). Keeps routes stable: small shape moves no longer flip between
 * equal-distance alternatives, and the path takes the fewest corners.
 */
export const ELBOW_BEND_PENALTY = 100000;

/**
 * Length (world px) of the fixed, non-movable terminal segment an elbow
 * connector always leaves at each end before its first bend — the endpoint
 * is pushed out this far along its exit heading so the connector departs/
 * arrives perpendicular to the edge and there's buffer room to draw the
 * arrowhead. Must stay ≥ ELBOW_OBSTACLE_MARGIN so the pushed-out point
 * sits outside the inflated obstacle the A* router avoids. Larger → more
 * breathing room before the first bend. Range: 16–40.
 */
export const ELBOW_TERMINAL_BUFFER = 30;

/**
 * Clearance (world px) a candidate centred path (the "thread"/mid-S or the
 * C-wrap) must keep from a bound shape's interior before it counts as CROSSING
 * it. This is the threshold that decides thread-vs-wrap-vs-A*: a larger value
 * makes the router bail off the direct/centred path sooner (route stays further
 * from shapes), a smaller value lets it skim closer to an edge before detouring.
 * At 1 px it only rejects genuine interior crossings, allowing edge-grazing.
 * Range: 1–8.
 */
export const ELBOW_OBSTACLE_CLEARANCE = 1;

/**
 * Parametric step used to sample each segment of a candidate path when testing
 * whether it crosses a shape (`pathCrossesObstacle`). Smaller = finer (catches
 * a narrow shape a coarse sampling would skip) at more cost; 0.1 samples 11
 * points per segment, enough for typical shape sizes. Range: 0.02–0.2.
 */
export const ELBOW_CROSS_SAMPLE_STEP = 0.1;

/**
 * --- Curved (bezier) link geometry ---
 *
 * Shared by the renderer (draws cubic beziers), hit-testing and bounds
 * (flatten the same curve) so the visible curve and the clickable curve
 * agree. Lives in scene so lower layers own the geometry; renderer-core
 * imports it.
 *
 * - `CURVE_CATMULL_TENSION` — divisor for the Catmull-Rom tangents in the
 *   spline→bezier conversion (waypointed curves). 6 is canonical uniform
 *   Catmull-Rom (control point = P + (Pnext − Pprev) / 6). Larger → tighter;
 *   smaller → looser. Range: 4–8.
 * - `CURVE_END_TANGENT_RATIO` — for a no-waypoint span the cubic's control
 *   arms leave/enter the endpoints along their edge normals with length =
 *   this fraction of the endpoint distance, so the connector exits/enters
 *   perpendicular to the element edge (flowchart look). Larger → rounder /
 *   more pronounced. Range: 0.25–0.6.
 * - `CURVE_END_TANGENT_MAX_PX` — caps that control-arm length (world px) so a
 *   long link doesn't over-bow. Range: 60–160.
 * - `CURVE_FLATTEN_SEGMENTS` — samples per cubic when flattening the curve
 *   for hit-testing / bounds. Higher = closer to the drawn curve. Range:
 *   8–24.
 */
export const CURVE_CATMULL_TENSION = 6;
export const CURVE_END_TANGENT_RATIO = 0.8;
export const CURVE_END_TANGENT_MAX_PX = 240;
export const CURVE_FLATTEN_SEGMENTS = 16;

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

/**
 * --- Text bounds estimation ---
 *
 * The text bounder has no layout engine, so it approximates the box.
 * Renderers compute the precise layout (via `measureText`) during
 * draw / caret positioning; these factors only drive selection bbox
 * and resize-handle placement, where a rough estimate is fine.
 *
 * - `TEXT_APPROX_CHAR_WIDTH_FACTOR` — average glyph advance as a
 *   fraction of font size (~0.6 for proportional Latin text).
 * - `TEXT_LINE_HEIGHT_FACTOR` — line height as a multiple of font
 *   size. Must match the renderer's `DEFAULT_LINE_HEIGHT_FACTOR`.
 */
export const TEXT_APPROX_CHAR_WIDTH_FACTOR = 0.6;
export const TEXT_LINE_HEIGHT_FACTOR = 1.2;
