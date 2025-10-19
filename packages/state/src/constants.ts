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
 * Screen-pixel half-size of the visible resize-handle square. Handles
 * are drawn `HANDLE_SIZE * 2` wide (5 → 10×10 px). Purely visual — the
 * grab area is `HANDLE_HIT_SLOP`, decoupled from this. Reasonable
 * range: 4–6 (smaller looks lighter; larger reads heavy).
 */
export const HANDLE_SIZE = 5;

/**
 * Screen-pixel offset between the handle's centre and the shape's bbox
 * edge — pushes the handle just outside the body so its hit area never
 * overlaps the shape interior, making corners grabbable without
 * precision-pointing. Range: 2–4.
 */
export const HANDLE_OUTSET = 3;

/**
 * Screen-pixel hit-test half-size (mouse) for a resize handle —
 * decoupled from the visual `HANDLE_SIZE`/`HANDLE_OUTSET` so the
 * grab target can grow without enlarging the drawn square. 11 → a
 * ~22 px clickable target around each handle centre. Touch hosts use
 * the larger `TOUCH_HANDLE_HIT_SLOP`. Range: 8–14 (too large starts
 * eating the body-move target on small shapes).
 */
export const HANDLE_HIT_SLOP = 11;

/**
 * Screen-pixel hit-test slop for grabbing an edge endpoint handle.
 * Larger than `LINK_ENDPOINT_HANDLE_DRAW_RADIUS` so the handle is
 * easier to grab on touch without enlarging the visual. Mouse default
 * (touch uses `TOUCH_LINK_HANDLE_HIT_SLOP`). Range: 9–13.
 */
export const LINK_ENDPOINT_HANDLE_RADIUS = 11;

/**
 * Screen-pixel visual radius of the edge endpoint handle. Kept
 * smaller than the hit radius so the dot does not obscure the path
 * tangent it sits on.
 */
export const LINK_ENDPOINT_HANDLE_DRAW_RADIUS = 6;

/**
 * Screen-pixel tolerance for edge hit-testing. Cursors within this
 * distance of an edge polyline segment register a hit. Should stay
 * larger than the typical stroke width but small enough that two
 * close edges don't both register the same click. Mouse default
 * (touch uses `TOUCH_LINK_HIT_THRESHOLD`). Range: 7–11.
 */
export const LINK_HIT_THRESHOLD = 9;

/**
 * Screen-pixel radius of the inactive port dot rendered on a hovered
 * shape in draw-edge mode. `PORT_DOT_ACTIVE_RADIUS` is used for the
 * snap target so the user sees which one will catch.
 */
export const PORT_DOT_RADIUS = 3.5;
export const PORT_DOT_ACTIVE_RADIUS = 5;

/**
 * Connection anchors.
 *
 * Two visual roles, shown at different times:
 *
 *   - **link-start** anchors — shown when an element is SELECTED. The user
 *     drags from one to begin a link. Filled brand centre + neutral ring.
 *   - **link-attach** anchors — shown when the cursor HOVERS / nears an
 *     element (including while dragging a link). Where a link can land.
 *     The inverse fill/ring of link-start, so the two roles read
 *     differently at a glance.
 *
 * Radii are screen px (zoom-independent). Colours reuse the selection
 * brand blue / handle white so anchors share the resize-handle visual
 * language (they equal `DEFAULT_OVERLAY_STYLE.selectionStroke` / `.handleFill`).
 */
export const ANCHOR_BRAND_COLOR = "#1a73e8";
export const ANCHOR_NEUTRAL_COLOR = "#fff";

/** Resting anchor-dot radius (screen px). */
export const ANCHOR_DOT_RADIUS = 3.5;
/** Highlighted radius for the hovered / snap-target anchor (screen px). */
export const ANCHOR_DOT_ACTIVE_RADIUS = 5;
/** Ring stroke width for anchor dots (screen px). Range: 1–2.5. */
export const ANCHOR_DOT_STROKE_WIDTH = 1.5;

/** link-start dot: filled brand centre, neutral (white) ring. */
export const LINK_START_ANCHOR_FILL = ANCHOR_BRAND_COLOR;
export const LINK_START_ANCHOR_STROKE = ANCHOR_NEUTRAL_COLOR;
/** link-attach dot: neutral (white) centre, brand ring — inverse of start. */
export const LINK_ATTACH_ANCHOR_FILL = ANCHOR_NEUTRAL_COLOR;
export const LINK_ATTACH_ANCHOR_STROKE = ANCHOR_BRAND_COLOR;

/**
 * Screen-px distance each anchor dot is pushed OUTWARD from the element
 * edge along its outward normal ("floating" ports). Two independent knobs
 * because the roles want different offsets:
 *
 *   - **link-start** sits a few px off the edge so it reads as a separate
 *     grab affordance ("drag from here"), clear of the element's own
 *     border and resize handles. Range: 0–16.
 *   - **link-attach** stays ON (or barely off) the edge because it marks
 *     where the link will actually land — a large offset re-introduces the
 *     dot-vs-landing-point mismatch. Default 0 (exactly on the edge); bump
 *     only if dots are hard to see. Range: 0–8.
 *
 * Applied only to the discrete named / edge anchor dots; the free
 * outline-attach point is never offset (it is the real landing point).
 */
export const LINK_START_ANCHOR_OUTSET = 8;
export const LINK_ATTACH_ANCHOR_OUTSET = 0;

/**
 * Screen-px proximity: link-attach anchors reveal once the cursor is
 * within this distance of an element's bounds (modern-style "near the
 * shape" reveal), not only when directly over it. Range: 16–40.
 */
export const ANCHOR_ATTACH_SHOW_DISTANCE = 24;

/**
 * Debug hit-zone overlay (debug panel → Display → "Show hit-zones").
 * Visualises the mouse hit-targets (handle slop, edge-endpoint radius,
 * edge-body threshold) so the values tuned in this layer can be
 * eyeballed in the browser. `_FILL_OPACITY` keeps the translucent fill
 * from hiding the geometry underneath; `_STROKE_OPACITY` outlines each
 * zone. Pure debug — never drawn unless the flag is on.
 */
export const DEBUG_HIT_ZONE_FILL = "#e8118c";
export const DEBUG_HIT_ZONE_STROKE = "#e8118c";
export const DEBUG_HIT_ZONE_FILL_OPACITY = 0.16;
export const DEBUG_HIT_ZONE_STROKE_OPACITY = 0.7;

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
 *   wheel notch when the handler routes the wheel event to pan
 *   (trackpad two-finger swipe). 1 = native pixel; lower than 1
 *   makes the wheel feel sluggish on high-DPI mice.
 * - `WHEEL_ZOOM_STEP` — multiplicative zoom factor used by the
 *   programmatic button-style zoom (`Editor.zoomIn` / `zoomOut`).
 *   `1.6 = +60% per call` — punchy single-step zoom.
 * - `WHEEL_ZOOM_MAX_STEP` / `WHEEL_ZOOM_SPEED` — wheel-zoom
 *   normalisation (`packages/editor/.../normalizeWheel.ts`).
 *   Per event:
 *
 *     delta  = clamp(|deltaY|, WHEEL_ZOOM_MAX_STEP) * sign(deltaY)
 *     factor = 1 − (delta * WHEEL_ZOOM_SPEED) / 100
 *
 *   The clamp tames mouse-wheel ratchets (Firefox / Chrome emit
 *   `|deltaY|` 53 / 100 per notch — uncapped that yields a near-10×
 *   jump). Trackpad pinches come through with small `|deltaY|`
 *   (2–5) and bypass the clamp, so they stay smooth and granular.
 *   Defaults: clamp at 10, speed 1 → ~10 % per mouse notch,
 *   ~2 % per pinch frame.
 * - `MIN_ZOOM` / `MAX_ZOOM` — hard caps. Below MIN_ZOOM (very far
 *   out) culling/LOD save the frame; above MAX_ZOOM pixel-snapping
 *   artefacts appear.
 *
 * Device classification in the wheel handler is `deltaX`-based —
 * mouse wheels never set deltaX, so any horizontal component routes
 * to pan and pure-vertical routes to zoom. Pure-vertical trackpad
 * swipes (rare) fall into zoom; users can pan via Space+drag or
 * right-click drag if needed.
 */
export const WHEEL_PAN_FACTOR = 1;
export const WHEEL_ZOOM_STEP = 1.6;
export const WHEEL_ZOOM_MAX_STEP = 10;
export const WHEEL_ZOOM_SPEED = 1;
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
 * Double-click recognition for group drill-down. A second pointer-up
 * within `DOUBLE_CLICK_MS` of the previous AND landing within
 * `DOUBLE_CLICK_TOLERANCE_PX` of the first point counts as a double-
 * click. Matches OS-level double-click windows (Windows default
 * 500 ms is too lenient for canvas; 300 ms feels snappier).
 */
export const DOUBLE_CLICK_MS = 300;
export const DOUBLE_CLICK_TOLERANCE_PX = 8;

/**
 * Multiplier applied to non-isolated shapes' globalAlpha when the
 * editor is in "entered group" mode (isolation). Shapes inside the
 * entered group stay at full alpha; everything outside fades to this
 * value so the active group reads as the focal area without losing
 * context. 0.6 keeps outsiders visible enough to be referenced; lower
 * (~0.3) makes isolation visually louder but at the cost of obscuring
 * context.
 */
export const ISOLATION_DIM_OPACITY = 0.6;

/**
 * Touch hit-test slop. WCAG and Apple HIG ask for ≥ 44 pt touch
 * targets; with `HANDLE_SIZE = 4` (8 px visual square) the visual
 * stays small but the *hit area* enlarges so a finger can grab it.
 *
 * - `TOUCH_HANDLE_HIT_SLOP` — half-size of the resize-handle hit
 *   rectangle in screen pixels (44 pt ≈ 22 px half = 44 px target).
 * - `TOUCH_LINK_HANDLE_HIT_SLOP` — same for edge-endpoint dots.
 * - `TOUCH_LINK_HIT_THRESHOLD` — line-tolerance for tapping on an
 *   edge body.
 */
export const TOUCH_HANDLE_HIT_SLOP = 22;
export const TOUCH_LINK_HANDLE_HIT_SLOP = 22;
export const TOUCH_LINK_HIT_THRESHOLD = 18;

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
 * Hit-test acceleration threshold. When `scene.elements.size` reaches
 * this value, `Editor.hitTest` switches from the linear `getElementAt`
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

/**
 * Default upper bound on the longer edge of a freshly-inserted
 * image (CSS pixels). Larger images get downscaled proportionally
 * by the built-in image file-drop handler so a 4000×3000 phone
 * snapshot doesn't blanket the viewport. Hosts that want a
 * different cap can `unregisterFileDropHandler("image")` and
 * register their own.
 */
export const DEFAULT_IMAGE_MAX_EDGE_PX = 480;

/**
 * Adaptive animation-tick throttling (GIF / video playback). The tick
 * drives a full re-render every frame while an animated shape is
 * visible; under load it is throttled so playback doesn't starve the
 * interaction frame budget.
 *
 * - `ANIMATION_MIN_INTERVAL_MS` — fastest tick (≈60fps). Healthy
 *   scenes hit this.
 * - `ANIMATION_MAX_INTERVAL_MS` — slowest tick under heavy load
 *   (≈12fps). GIFs still read as animated; frames are dropped.
 * - `ANIMATION_COST_FACTOR` — target interval = clamp(emaRenderCost ×
 *   factor, min, max). Factor > 1 leaves headroom for the rest of the
 *   frame (input, layout) so the render cost doesn't fill the budget.
 */
export const ANIMATION_MIN_INTERVAL_MS = 1000 / 60;
export const ANIMATION_MAX_INTERVAL_MS = 1000 / 12;
export const ANIMATION_COST_FACTOR = 2;

/**
 * Per-shape GIF playback policy.
 *
 * - `HEAVY_GIF_BYTES` — animationData (raw GIF bytes) above this counts
 *   as "heavy". Light GIFs loop forever; heavy ones auto-stop to save
 *   CPU/GPU. 2 MB ≈ a large multi-frame GIF.
 * - `GIF_AUTOSTOP_MS` — a heavy GIF freezes after this much continuous
 *   playback. A click resumes it (and restarts the timer).
 */
export const HEAVY_GIF_BYTES = 2 * 1024 * 1024;
export const GIF_AUTOSTOP_MS = 30_000;

/**
 * Defaults for a text shape created via the `draw-text` tool (click on
 * the canvas). Tweak to change the look of freshly-placed text before
 * the user has touched the contextual panel.
 *
 * - `TEXT_DEFAULT_FONT_SIZE` — initial font size in world units.
 * - `TEXT_DEFAULT_FONT_FAMILY` — initial font stack.
 * - `TEXT_DEFAULT_FILL` — initial text colour (near-black).
 * - `TEXT_FONT_SIZE_MIN` / `TEXT_FONT_SIZE_MAX` — clamp range for the
 *   font-size control in the contextual panel.
 */
export const TEXT_DEFAULT_FONT_SIZE = 24;
export const TEXT_DEFAULT_FONT_FAMILY = "system-ui, sans-serif";
export const TEXT_DEFAULT_FILL = "#1a1a1a";
export const TEXT_FONT_SIZE_MIN = 8;
export const TEXT_FONT_SIZE_MAX = 256;

/**
 * In-canvas text editing.
 *
 * - `CARET_BLINK_INTERVAL_MS` — half-period of the caret blink (the
 *   caret toggles visible/hidden every interval). 530 ms matches the
 *   platform default most editors use. Typing/moving resets it to
 *   visible so the caret never blinks off mid-interaction.
 * - `TEXT_SELECTION_FILL` / `TEXT_SELECTION_OPACITY` — selection
 *   highlight colour + alpha (~0.17 over the text).
 * - `TEXT_CARET_WIDTH_PX` — caret bar width in screen px.
 * - `TEXT_RESIZE_MIN_FONT_SIZE` — clamp so corner-resize can't shrink
 *   text below a usable size.
 */
export const CARET_BLINK_INTERVAL_MS = 530;
export const TEXT_SELECTION_FILL = "#1a73e8";
export const TEXT_SELECTION_OPACITY = 0.25;
export const TEXT_CARET_WIDTH_PX = 1.5;
export const TEXT_RESIZE_MIN_FONT_SIZE = 4;
