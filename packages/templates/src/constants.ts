/**
 * Tunable constants for built-in templates and icon rendering. Hosts that
 * want larger / smaller palette icons can override `ICON_VIEWBOX_SIZE`
 * (the SVG viewBox edge, square) before constructing custom icons; the
 * built-in icon set still bakes the 24-unit viewBox via `wrap()`.
 */

/** Edge length, in SVG user units, of the palette-icon viewBox. */
export const ICON_VIEWBOX_SIZE = 24;

/** Default stroke width applied to palette icons. */
export const ICON_STROKE_WIDTH = 2;
