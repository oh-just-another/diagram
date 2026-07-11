/**
 * Tunable defaults for the importers package (graph layout sizing / spacing,
 * scene materialisation). Magic numbers live here per the repo's constants
 * policy so layout density and default node styling can be tuned in one place.
 */

/** Default node width, in world pixels, when a format omits an explicit size. */
export const DEFAULT_NODE_WIDTH = 120;

/** Default node height, in world pixels, when a format omits an explicit size. */
export const DEFAULT_NODE_HEIGHT = 60;

/**
 * Dagre node separation (gap between siblings in the same rank), in pixels.
 * Range: ~10–100; higher spreads nodes apart.
 */
export const LAYOUT_NODE_SEP = 40;

/**
 * Dagre rank separation (gap between ranks / layers), in pixels.
 * Range: ~20–150; higher spaces the levels of the graph further apart.
 */
export const LAYOUT_RANK_SEP = 60;

/**
 * Outer margin dagre adds around the laid-out graph, in pixels (applied on
 * both x and y). Range: 0–50.
 */
export const LAYOUT_GRAPH_MARGIN = 20;

/**
 * Margin added to the fitted scene viewport around the laid-out node bbox, in
 * pixels, so rendered output isn't flush to the edge. Range: 0–50.
 */
export const SCENE_FIT_MARGIN = 20;

/** Default font size, in pixels, for node labels. Range: ~10–20. */
export const NODE_LABEL_FONT_SIZE = 13;

/** Stroke width, in pixels, applied to materialised node shapes. */
export const NODE_STROKE_WIDTH = 1.5;

/** Stroke width, in pixels, applied to materialised edge connectors. */
export const EDGE_STROKE_WIDTH = 1;

// --- .excalidraw format ---

/** Stroke colour used when a .excalidraw element omits `strokeColor`. */
export const EXCALIDRAW_DEFAULT_STROKE = "#1e1e1e";

/** Font size, in pixels, used when a .excalidraw text element omits `fontSize`. */
export const EXCALIDRAW_DEFAULT_FONT_SIZE = 20;

/**
 * .excalidraw stores opacity as 0–100; our `Style.opacity` is 0–1. Divide /
 * multiply by this on import / export.
 */
export const EXCALIDRAW_OPACITY_SCALE = 100;

/**
 * Fallback pen pressure for freedraw points without a `pressures` entry
 * (`simulatePressure` strokes). 0.5 keeps the brush half-width equal to the
 * source `strokeWidth` (see `FREEDRAW_WIDTH_PER_PRESSURE`). Range: 0–1.
 */
export const EXCALIDRAW_PRESSURE_FALLBACK = 0.5;

/**
 * Brush half-width per unit of (strokeWidth × pressure) when converting
 * freedraw points to `BrushPoint`s and back. Higher = fatter imported
 * strokes. Range: ~1–4.
 */
export const FREEDRAW_WIDTH_PER_PRESSURE = 2;

/** Dash pattern emitted for `strokeStyle: "dashed"` elements. */
export const DASH_PATTERN_DASHED: readonly number[] = [8, 8];

/** Dash pattern emitted for `strokeStyle: "dotted"` elements. */
export const DASH_PATTERN_DOTTED: readonly number[] = [1.5, 6];

/**
 * A `dashArray` whose first entry is at or below this threshold, in pixels,
 * exports as `strokeStyle: "dotted"`; anything longer exports as `"dashed"`.
 */
export const DOTTED_DASH_MAX = 2;

/**
 * Tolerance, in pixels, when detecting whether a 4-point polygon is an
 * axis-midpoint diamond (exportable as a .excalidraw `diamond`).
 */
export const DIAMOND_EPSILON = 0.01;

/** `source` field written into exported .excalidraw documents. */
export const EXCALIDRAW_EXPORT_SOURCE = "@oh-just-another/importers";

// --- JSON Canvas (jsoncanvas.org) ---

/** Font size, in pixels, for imported JSON Canvas text / file / link nodes. */
export const JSONCANVAS_FONT_SIZE = 14;

/**
 * Hex values for the six JSON Canvas preset colours (`color: "1"`…`"6"` =
 * red, orange, yellow, green, cyan, purple). Hex colours pass through as-is.
 */
export const JSONCANVAS_PRESET_COLORS: Readonly<Record<string, string>> = {
  "1": "#fb464c",
  "2": "#e9973f",
  "3": "#e0de71",
  "4": "#44cf6e",
  "5": "#53dfdd",
  "6": "#a882ff",
};
