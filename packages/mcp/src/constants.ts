/** MCP server identity advertised during the initialize handshake. */
export const SERVER_NAME = "oja-mcp";

/**
 * Server version reported to MCP clients. Kept in sync with the package
 * version by the release process.
 */
export const SERVER_VERSION = "0.1.0";

/**
 * Default width/height (scene units) for elements added without explicit
 * dimensions. Comfortable node size for auto-generated diagrams.
 */
export const DEFAULT_ELEMENT_WIDTH = 160;
export const DEFAULT_ELEMENT_HEIGHT = 80;

/** Default font size for text elements added without one. */
export const DEFAULT_FONT_SIZE = 16;

/** Default font family for text elements added without one. */
export const DEFAULT_FONT_FAMILY = "sans-serif";

/** Default stroke colour for elements/links added without a style. */
export const DEFAULT_STROKE = "#1e1e1e";

/**
 * Margin (scene units) added around content when an export has to derive the
 * viewport size from element bounds (scenes created via create_scene have a
 * zero-sized viewport until a client sets one).
 */
export const EXPORT_FIT_MARGIN = 20;
