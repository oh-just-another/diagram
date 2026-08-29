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

/**
 * Rich-template text defaults, used when a node's `style` leaves them out.
 * - `RICH_DEFAULT_FONT_FAMILY` / `RICH_DEFAULT_FONT_SIZE` — text and button
 *   nodes (layout measurement and paint). Range 10–24 px.
 * - `RICH_DEFAULT_LINE_HEIGHT` — line-height factor for text intrinsic
 *   height. Range 1–1.6.
 * - `RICH_BUTTON_LABEL_FONT_SIZE` — paint size of a button's label (the
 *   layout measures at `RICH_DEFAULT_FONT_SIZE`). Range 10–20.
 * - `RICH_FALLBACK_CHAR_WIDTH_FACTOR` — average glyph width as a fraction
 *   of the font size when the host supplies no text measurer. Range 0.45–0.65.
 * - `RICH_TEXT_BASELINE_FACTOR` — ascent as a fraction of the font size for
 *   baseline alignment in a row. Range 0.7–0.9.
 */
export const RICH_DEFAULT_FONT_FAMILY = "system-ui, sans-serif";
export const RICH_DEFAULT_FONT_SIZE = 14;
export const RICH_DEFAULT_LINE_HEIGHT = 1.2;
export const RICH_BUTTON_LABEL_FONT_SIZE = 13;
export const RICH_FALLBACK_CHAR_WIDTH_FACTOR = 0.55;
export const RICH_TEXT_BASELINE_FACTOR = 0.8;

/**
 * Rich-template node geometry defaults (world px).
 * - `RICH_BUTTON_PAD_X` / `RICH_BUTTON_PAD_Y` — button label padding
 *   (intrinsic size = label + 2 × pad). Range 4–16 / 2–12.
 * - `RICH_BUTTON_LABEL_INSET` — horizontal room kept free of the label
 *   before it is truncated with an ellipsis. Range 4–24.
 * - `RICH_ICON_INTRINSIC_SIZE` — square icon / image node size when the
 *   node declares none. Range 12–64.
 * - `RICH_DROP_ZONE_INTRINSIC_WIDTH` / `_HEIGHT` — a drop-zone's size when
 *   it is not stretched by its row. Range 40–200.
 * - `RICH_DROP_ZONE_PADDING` — inset between a container's drop-zone and
 *   the children dropped into it (also the default written into
 *   `metadata.container.padding`). Range 0–24.
 */
export const RICH_BUTTON_PAD_X = 10;
export const RICH_BUTTON_PAD_Y = 6;
export const RICH_BUTTON_LABEL_INSET = 12;
export const RICH_ICON_INTRINSIC_SIZE = 24;
export const RICH_DROP_ZONE_INTRINSIC_WIDTH = 80;
export const RICH_DROP_ZONE_INTRINSIC_HEIGHT = 60;
export const RICH_DROP_ZONE_PADDING = 8;

/**
 * Rich-template paint fallbacks (used when a node's `style` leaves the
 * colour out) and the diagnostics chrome.
 * - `RICH_TEXT_COLOR` — text nodes. `RICH_BUTTON_FILL` / `_STROKE` /
 *   `_TEXT_COLOR` — button nodes. `RICH_DROP_ZONE_STROKE` / `_LABEL_COLOR` /
 *   `_LABEL_FONT_SIZE` — drop-zone outline and placeholder label.
 *   `RICH_PORT_STROKE` — port dots. `RICH_ICON_TINT` — icon nodes.
 * - `RICH_DASH_PATTERN` — dash array for drop-zone and "missing template"
 *   outlines.
 * - `RICH_MISSING_COLOR` / `RICH_MISSING_FONT_SIZE` — the red "missing
 *   template: id" placeholder drawn when a template id cannot be resolved.
 */
export const RICH_TEXT_COLOR = "#000";
export const RICH_BUTTON_FILL = "#f4f4f4";
export const RICH_BUTTON_STROKE = "#888";
export const RICH_BUTTON_TEXT_COLOR = "#222";
export const RICH_DROP_ZONE_STROKE = "#888";
export const RICH_DROP_ZONE_LABEL_COLOR = "#999";
export const RICH_DROP_ZONE_LABEL_FONT_SIZE = 12;
/** Font family of the drop-zone label and the "missing template" placeholder. */
export const RICH_CHROME_FONT_FAMILY = "system-ui";
export const RICH_PORT_STROKE = "#888";
export const RICH_ICON_TINT = "#222";
export const RICH_DASH_PATTERN: readonly number[] = [4, 4];
export const RICH_MISSING_COLOR = "#c00";
export const RICH_MISSING_FONT_SIZE = 11;
