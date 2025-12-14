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
 * World-unit "dongle" gap an elbow connector leaves a shape before it is
 * free to turn — the endpoint is pushed out this far along its heading
 * (exit side) so the connector always departs perpendicular to the edge
 * (standard model). Larger → more breathing room before the first bend.
 */
export const ELBOW_DONGLE_GAP = 20;

/**
 * --- Curved (bezier) link geometry ---
 *
 * Shared by the renderer (draws cubic beziers), hit-testing and bounds
 * (flatten the same curve) so the visible curve and the clickable curve
 * agree. Lives in scene so lower layers own the geometry; renderer-core
 * imports it.
 *
 * - `CURVE_CATMULL_TENSION` — divisor for the Catmull-Rom tangents in the
 *   spline→bezier conversion. 6 is canonical uniform Catmull-Rom (control
 *   point = P + (Pnext − Pprev) / 6). Larger → tighter; smaller → looser.
 *   Range: 4–8.
 * - `CURVE_BULGE_RATIO` — for a straight 2-point span (no waypoints) the
 *   synthetic mid-point is offset perpendicular to the chord by this
 *   fraction of the chord length, so "Curved" reads as a visible arc even
 *   between axis-aligned shapes. Range: 0.1–0.3.
 * - `CURVE_BULGE_MAX_PX` — caps that perpendicular offset (world px) so a
 *   long link doesn't balloon. Range: 40–120.
 * - `CURVE_FLATTEN_SEGMENTS` — samples per cubic when flattening the curve
 *   for hit-testing / bounds. Higher = closer to the drawn curve. Range:
 *   8–24.
 */
export const CURVE_CATMULL_TENSION = 6;
export const CURVE_BULGE_RATIO = 0.18;
export const CURVE_BULGE_MAX_PX = 80;
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
