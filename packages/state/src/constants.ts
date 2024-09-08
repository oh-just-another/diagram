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

/**
 * Visual sizes for the remote-peer cursor overlay.
 *
 * - `CURSOR_ARROW_SIZE` — pixel side length of the arrow glyph.
 * - `CURSOR_NAME_CHIP_OFFSET` — pixel offset of the name chip from
 *   the arrow tip, both axes.
 * - `CURSOR_NAME_CHIP_PADDING_X / Y` — inner padding of the chip.
 * - `CURSOR_NAME_FONT_SIZE` — chip text font size.
 */
export const CURSOR_ARROW_SIZE = 16;
export const CURSOR_NAME_CHIP_OFFSET = 14;
export const CURSOR_NAME_CHIP_PADDING_X = 6;
export const CURSOR_NAME_CHIP_PADDING_Y = 3;
export const CURSOR_NAME_FONT_SIZE = 11;

/**
 * Peer selection halo — dashed outline drawn around each shape a peer
 * has selected, in the peer's colour. `PEER_SELECTION_PADDING` insets
 * the outline outward so it does not overlap own selection.
 */
export const PEER_SELECTION_STROKE_WIDTH = 1.5;
export const PEER_SELECTION_DASH: readonly number[] = [4, 3];
export const PEER_SELECTION_PADDING = 3;

/**
 * Throttle for broadcasting local pointer position to peers. 30 fps
 * matches the perceptual cap for cursor motion; lower values create
 * more network chatter without UX benefit.
 */
export const PEER_CURSOR_BROADCAST_INTERVAL_MS = 33;

/**
 * Mouse-wheel handling.
 *
 * - `WHEEL_PAN_FACTOR` — how many world units (at zoom 1) to pan per
 *   wheel notch on plain scroll. 1 = native pixel; lower than 1 makes
 *   the wheel feel sluggish on high-DPI mice.
 * - `WHEEL_ZOOM_STEP` — multiplicative zoom factor per wheel notch
 *   when modifier (Ctrl/Cmd) is held. 1.1 = +10% per notch; smaller
 *   feels smoother but takes more spins to traverse 10×.
 * - `MIN_ZOOM` / `MAX_ZOOM` — hard caps. Below MIN_ZOOM (very far
 *   out) culling/LOD save the frame; above MAX_ZOOM pixel-snapping
 *   artefacts appear.
 */
export const WHEEL_PAN_FACTOR = 1;
export const WHEEL_ZOOM_STEP = 1.1;
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 32;

/**
 * Two-finger pinch / pan gesture.
 *
 * - `PINCH_MIN_MOVEMENT_PX` — ignore minor jitter while two fingers
 *   stay roughly still (e.g. user resting both fingers on screen).
 *   Below this displacement the gesture frame is a no-op.
 */
export const PINCH_MIN_MOVEMENT_PX = 0.5;

/**
 * Long-press → context menu. `LONG_PRESS_DELAY_MS` is the dwell time
 * before a stationary press fires a `LONG_PRESS` emit; movement
 * beyond `LONG_PRESS_MAX_MOVEMENT_PX` cancels it.
 */
export const LONG_PRESS_DELAY_MS = 500;
export const LONG_PRESS_MAX_MOVEMENT_PX = 8;

/**
 * Touch hit-test slop. WCAG and Apple HIG ask for ≥ 44 pt touch
 * targets; with `HANDLE_SIZE = 4` (8 px visual square) the visual
 * stays small but the *hit area* enlarges so a finger can grab it.
 *
 * - `TOUCH_HANDLE_HIT_SLOP` — half-size of the resize-handle hit
 *   rectangle in screen pixels (44 pt ≈ 22 px half = 44 px target).
 * - `TOUCH_EDGE_HANDLE_HIT_SLOP` — same for edge-endpoint dots.
 * - `TOUCH_EDGE_HIT_THRESHOLD` — line-tolerance for tapping on an
 *   edge body.
 */
export const TOUCH_HANDLE_HIT_SLOP = 22;
export const TOUCH_EDGE_HANDLE_HIT_SLOP = 22;
export const TOUCH_EDGE_HIT_THRESHOLD = 18;

/**
 * Annotation pin visuals on the overlay.
 *
 * - `ANNOTATION_PIN_RADIUS` — screen-pixel radius of the circular pin
 *   marker. Same size regardless of zoom so the marker stays grabable
 *   at any scale.
 * - `ANNOTATION_PIN_HIT_SLOP` — half-size of the hit rect used by
 *   `hitAnnotation`. Should be ≥ touch target (44 px) when running in
 *   touch mode; defaults give a comfortable mouse grab zone.
 * - `ANNOTATION_PIN_FILL` / `STROKE` — colours when unselected.
 * - `ANNOTATION_PIN_RESOLVED_FILL` — muted colour for resolved threads
 *   (host can still cycle through them but they read as "settled").
 */
export const ANNOTATION_PIN_RADIUS = 9;
export const ANNOTATION_PIN_HIT_SLOP = 12;
export const ANNOTATION_PIN_FILL = "#f9a825";
export const ANNOTATION_PIN_STROKE = "#fff";
export const ANNOTATION_PIN_RESOLVED_FILL = "#888";
export const ANNOTATION_PIN_BADGE_FONT_SIZE = 10;
