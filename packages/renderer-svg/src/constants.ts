/**
 * Tunable thresholds for the SVG backend.
 */

/**
 * Font size in CSS pixels used when no font has been set on the target.
 * Applies to text measurement and the `font-size` attribute of emitted
 * `<text>` elements until `setFont` overrides it. Sensible range: 8–72.
 */
export const DEFAULT_FONT_SIZE_PX = 14;

/**
 * Control-point ratio for approximating a quarter ellipse with one cubic
 * Bezier. Applies to `ellipse`, scaling the radii to place the off-axis
 * control points. The value is fixed for a faithful arc; changing it
 * distorts the curve.
 */
export const KAPPA = 0.5522847498307936;

/**
 * Fallback width ratio (as a fraction of font size) for glyphs absent from
 * the per-character table. Applies during text-width approximation; raising
 * it widens unknown characters, lowering it narrows them. Sensible range:
 * 0.4–0.7.
 */
export const DEFAULT_CHAR_WIDTH_RATIO = 0.55;
