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
