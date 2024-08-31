/**
 * Tunable constants for the interaction layer (`Editor`, interaction
 * machine, snap engine, viewport math). Put any threshold / default /
 * timing the host might want to tweak here — keep magic numbers out
 * of the hot path code.
 */

/**
 * World-unit distance below which a snap candidate is preferred over
 * the raw cursor position. Smaller → snap feels less "grabby", larger
 * → easier to land on a target but more disruptive drag micro-jumps.
 * 12 px is the default for a 1:1 zoom; the engine internally scales
 * by zoom so the effective screen distance stays roughly constant.
 */
export const DEFAULT_SNAP_THRESHOLD = 12;

/**
 * Padding ratio added to the world-space viewport rect before passing
 * it to `renderScene` for culling. 0.05 = 5% padding on each side —
 * masks a one-frame pan so shapes near the edge do not flicker.
 * Increase if hosts observe pop-in on fast pans; decrease to keep
 * fewer off-screen shapes alive in the renderer pipeline.
 */
export const VIEWPORT_CULL_PADDING_RATIO = 0.05;

/**
 * Screen-pixel hit-test slop for grabbing an edge endpoint handle.
 * Larger than `EDGE_ENDPOINT_HANDLE_DRAW_RADIUS` so the handle is
 * easier to grab on touch without enlarging the visual.
 */
export const EDGE_ENDPOINT_HANDLE_RADIUS = 8;

/**
 * Screen-pixel visual radius of the edge endpoint handle. Kept
 * smaller than the hit radius so the dot does not obscure the path
 * tangent it sits on.
 */
export const EDGE_ENDPOINT_HANDLE_DRAW_RADIUS = 6;

/**
 * Screen-pixel tolerance for edge hit-testing. Cursors within this
 * distance of an edge polyline segment register a hit. Should stay
 * larger than the typical stroke width but small enough that two
 * close edges don't both register the same click.
 */
export const EDGE_HIT_THRESHOLD = 6;

/**
 * Screen-pixel radius of the inactive port dot rendered on a hovered
 * shape in draw-edge mode. `PORT_DOT_ACTIVE_RADIUS` is used for the
 * snap target so the user sees which one will catch.
 */
export const PORT_DOT_RADIUS = 3.5;
export const PORT_DOT_ACTIVE_RADIUS = 5;
