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
 * - `WHEEL_ZOOM_STEP` — multiplicative zoom factor used by the
 *   programmatic button-style zoom (`Editor.zoomIn` / `zoomOut`).
 *   1.1 = +10% per call.
 * - `WHEEL_ZOOM_SENSITIVITY` — controls how aggressively a Ctrl/Cmd +
 *   wheel (or trackpad pinch) maps |deltaY| to a zoom factor. The
 *   handler applies `factor = exp(-deltaY * SENSITIVITY)`, so the
 *   factor scales with the magnitude of the wheel/pinch delta instead
 *   of stepping by a fixed amount per event. Tuned so that ~20 px of
 *   accumulated |deltaY| matches `WHEEL_ZOOM_STEP` (≈ 1.1) — markedly
 *   faster than one mouse notch (~100 px) so the pinch gesture feels
 *   responsive, while a single pinch frame (`|deltaY| ≈ 2–5`) still
 *   steps a gentle 1–2.4 %. Increase the divisor for a calmer pinch;
 *   decrease for a snappier one. Default = `ln(WHEEL_ZOOM_STEP) / 20`.
 * - `MIN_ZOOM` / `MAX_ZOOM` — hard caps. Below MIN_ZOOM (very far
 *   out) culling/LOD save the frame; above MAX_ZOOM pixel-snapping
 *   artefacts appear.
 */
export const WHEEL_PAN_FACTOR = 1;
export const WHEEL_ZOOM_STEP = 1.1;
export const WHEEL_ZOOM_SENSITIVITY = Math.log(WHEEL_ZOOM_STEP) / 20;
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

/**
 * Hit-test acceleration threshold. When `scene.shapes.size` reaches
 * this value, `Editor.hitTest` switches from the linear `getShapeAt`
 * scan to a lazy SpatialGrid keyed by scene-identity. The grid pays
 * for itself only on large scenes; below the threshold the rebuild
 * cost outweighs the per-click savings. Tune down if hosts profile
 * regression on medium scenes (~3k–8k shapes).
 */
export const LARGE_SCENE_HIT_THRESHOLD = 2_000;

/**
 * Minimum AABB coverage ratio required for a shape to fall into the
 * rubber-band lasso. `0` would behave like pure intersection (any
 * touch grabs the shape — feels too eager); `1` requires full
 * containment (needs precise lasso). `0.5` is the default — brushing
 * past an edge does not grab the shape, but covering most of it does.
 * Bidirectional rule: a tiny lasso entirely inside a big shape also
 * picks it up.
 */
export const LASSO_COVERAGE_THRESHOLD = 0.5;

/**
 * Minimum coverage ratio for keeping a child inside its parent
 * container after a drag. If `intersection.area / childBounds.area`
 * stays above this threshold, the editor extends the container's
 * drop-zone (+ outer size) instead of dropping the parent link.
 * Below it — the user clearly dragged the child out, so `parentId`
 * is cleared. 0.5 = "if more than half of the element is still in
 * the lane, grow the lane to keep it".
 */
export const CONTAINER_KEEP_THRESHOLD = 0.5;

/**
 * Max `order` string length (chars) before the editor schedules an
 * automatic layer-wide compaction. Fractional keys lengthen the key by
 * 1–2 chars per insert-in-the-middle; > 12 means inserts have been
 * bursting at the same spot and it is time to rebalance back to short
 * keys. Compaction runs transparently in a microtask after the mutating
 * notify, so the user never sees the long-key state.
 */
export const AUTO_COMPACT_THRESHOLD = 12;

/**
 * Maximum local-pixel half-width of a brush vertex. Hosts compute the
 * actual width as `pressure × MAX_BRUSH_WIDTH`; `pressure` is the
 * `PointerEvent.pressure` field, which is normalised to [0, 1] on
 * pointer devices that report it (Apple Pencil, Wacom). Devices
 * without pressure get `0.5` from the browser, yielding mid-range
 * width.
 */
export const MAX_BRUSH_WIDTH = 6;

/**
 * Half-width used when `PointerEvent.pressure` is 0 (most mice in
 * Chromium) so a click-drag still produces a visible stroke.
 */
export const DEFAULT_BRUSH_WIDTH = 2;
