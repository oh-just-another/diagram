/**
 * Tunable visual sizes for the React UI panels and toolbar. Pixel values,
 * overridable via component props when a host wants a different layout —
 * these are the defaults baked into the built-in panels.
 */

/** Width of the left palette panel, in CSS pixels. */
export const PALETTE_WIDTH = 200;

/** Pixel side of the per-template hit area inside the palette grid. */
export const PALETTE_ITEM_SIZE = 28;

/** Width of the right property panel, in CSS pixels. */
export const PROPERTY_PANEL_WIDTH = 240;

/** Pixel side of the colour swatches inside the property panel. */
export const PROPERTY_SWATCH_SIZE = 12;

/** Width of the layer panel, in CSS pixels. */
export const LAYER_PANEL_WIDTH = 220;

/** Pixel side of the toggle icon (visibility / lock) buttons. */
export const LAYER_TOGGLE_ICON_SIZE = 20;

/** Pixel side of the per-row colour swatch in the layer panel. */
export const LAYER_SWATCH_SIZE = 22;

/** Width of the comments popover, in CSS pixels. */
export const COMMENTS_PANEL_WIDTH = 280;

/** Pixel height of the toolbar vertical separator. */
export const TOOLBAR_SEPARATOR_HEIGHT = 20;

/**
 * Default auto-dismiss time for a toast (ms). 0 / Infinity keep it
 * open until the user clicks the × — useful for sticky errors.
 */
export const TOAST_DEFAULT_DURATION_MS = 3_000;

/**
 * Maximum width of the `<HelpDialog>` modal in CSS pixels. The dialog
 * still respects the viewport via `min(this, 100vw - 64px)`.
 */
export const HELP_DIALOG_MAX_WIDTH_PX = 720;
