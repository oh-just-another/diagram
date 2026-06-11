/**
 * Tunable constants for the interaction layer (`Editor`, interaction
 * machine, snap engine, viewport math). Put any threshold / default /
 * timing the host might want to tweak here — keep magic numbers out
 * of the hot path code.
 */
import type { ArrowheadStyle, LinkRouting } from "@oh-just-another/scene";

/**
 * World-unit distance below which a snap candidate is preferred over
 * the raw cursor position. Smaller → snap feels less "grabby", larger
 * → easier to land on a target but more disruptive drag micro-jumps.
 * 12 px is the default for a 1:1 zoom; the engine internally scales
 * by zoom so the effective screen distance stays roughly constant.
 */
export const DEFAULT_SNAP_THRESHOLD = 12;

/**
 * Routing of a newly created link. `"orthogonal"` (elbow) is the default —
 * matches the flowchart-style connectors users expect. Set to `"straight"` or
 * `"bezier"` to change the default for new links; the per-link toolbar can
 * still switch any individual link afterwards.
 */
export const DEFAULT_LINK_ROUTING: LinkRouting = "orthogonal";

/** Arrowhead on the `to` end of a newly created link. */
export const DEFAULT_LINK_ARROWHEAD: ArrowheadStyle = "triangle";

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
 * Screen-pixel visual radius of a segment-midpoint "add waypoint" handle
 * on the selected link. Smaller than an endpoint/waypoint handle so the
 * insert affordance reads as secondary. Range: 3–5.
 */
export const LINK_MIDPOINT_HANDLE_DRAW_RADIUS = 4;

/**
 * Screen-pixel radius within which releasing a dragged waypoint next to an
 * adjacent path point collapses (removes) it — "drag onto the line to
 * delete". Kept near the handle hit radius. Range: 8–16.
 */
export const WAYPOINT_COLLAPSE_RADIUS = 12;

/**
 * Upper bound on how many candidate obstacles the A*-based "route around
 * shapes" command will consider. Above this the command bails (returns the
 * link unchanged) rather than spending the A* cost. Range: 100–1000.
 */
export const AUTO_ROUTE_MAX_OBSTACLES = 400;

/**
 * Screen-pixel tolerance for edge hit-testing. Cursors within this
 * distance of an edge polyline segment register a hit. Should stay
 * larger than the typical stroke width but small enough that two
 * close edges don't both register the same click. Mouse default
 * (touch uses `TOUCH_LINK_HIT_THRESHOLD`). Range: 7–11.
 */
export const LINK_HIT_THRESHOLD = 9;

/**
 * How far (screen px) the selection halo peeks out beyond an object's
 * VISIBLE outer edge — shared by elements and links. The halo is sized so
 * it always shows exactly this much past the shape's contour + its border
 * extent (which depends on stroke width and inside/center/outside
 * alignment), at every zoom. Constant on screen regardless of border
 * thickness. Range: 3–8.
 */
export const SELECTION_HALO_PEEK_PX = 4;

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
/**
 * Max radius (screen px) of the nearest link-start dot at closest cursor
 * approach. The dot scales smoothly from {@link ANCHOR_DOT_RADIUS} up to this
 * as the cursor enters {@link ANCHOR_DOT_HOVER_GROW_RADIUS} ("grows as you
 * approach"), instead of a binary jump to the active radius.
 */
export const ANCHOR_DOT_HOVER_MAX_RADIUS = 8;
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
 *   - **link-start** sits off the edge so it reads as a separate grab
 *     affordance ("drag from here"), clear of the element's own border and
 *     resize handles. Range: 0–28.
 *   - **link-attach** stays ON (or barely off) the edge because it marks
 *     where the link will actually land — a large offset re-introduces the
 *     dot-vs-landing-point mismatch. Default 0 (exactly on the edge); bump
 *     only if dots are hard to see. Range: 0–8.
 *
 * Applied only to the discrete named / edge anchor dots; the free
 * outline-attach point is never offset (it is the real landing point).
 */
export const LINK_START_ANCHOR_OUTSET = 20;
export const LINK_ATTACH_ANCHOR_OUTSET = 0;

/**
 * Default body fill for a freshly-created frame. Frames must have a
 * background (no element is background-less); white reads on most canvases.
 * Carried in `style.fill` at creation so the property panel shows it and it
 * serialises; the renderer falls back to the same white if ever unset.
 */
export const FRAME_DEFAULT_FILL = "#ffffff";

/**
 * Screen-px slop ADDED to `ANCHOR_DOT_ACTIVE_RADIUS` when hit-testing a
 * press against a link-start anchor dot — the "drag a link straight from
 * the dot" gesture (no draw-edge tool needed). Mirrors `HANDLE_HIT_SLOP`
 * for resize handles: lets the user grab the small dot without pixel-
 * precision pointing. Grab radius = `ANCHOR_DOT_ACTIVE_RADIUS + this`,
 * divided by zoom. Range: 3–10 (too large starts stealing the body-drag
 * target near the element edge).
 */
export const ANCHOR_START_HIT_SLOP = 6;
/**
 * Narrow hit radius (screen px) for "clicked exactly ON a link-start dot"
 * — distinct from the wider grab halo (`ANCHOR_DOT_ACTIVE_RADIUS +
 * ANCHOR_START_HIT_SLOP`) that begins a drag/deselect. A non-dragging
 * release within this radius of a dot means "create a new element + link";
 * a release in the surrounding halo but outside this radius deselects. Kept
 * ≤ the grab radius so the create zone sits inside it.
 */
export const ANCHOR_DOT_CLICK_RADIUS = 7;
/**
 * Screen-px proximity at which the nearest link-start dot is "grown"
 * (rendered at `ANCHOR_DOT_ACTIVE_RADIUS` instead of the resting radius)
 * as the cursor approaches it — the dot's affordance hint. Kept ≥
 * the grab radius so the dot visibly grows slightly before it becomes
 * grabbable. Range: 12–28.
 */
export const ANCHOR_DOT_HOVER_GROW_RADIUS = 18;
/**
 * World-px gap between a selected element and the new element created by
 * clicking one of its link-start dots (click a dot → spawn a copy in that
 * dot's direction, linked). Fixed, independent of element size.
 */
export const ANCHOR_CLICK_NEW_ELEMENT_GAP = 40;

/**
 * Debug hit-zone overlay (debug panel → Display → "Show hit-zones" /
 * `?hitzones=1`). Visualises the mouse hit-targets so the values tuned in
 * this layer can be eyeballed in the browser. `_FILL_OPACITY` keeps the
 * translucent fill from hiding the geometry underneath; `_STROKE_OPACITY`
 * outlines each zone. Pure debug — never drawn unless the flag is on.
 *
 * Shared opacities; per-category colours below so different hit-target kinds
 * are visually distinguishable (point vs edge vs body vs container vs frame).
 * Kept generic (`DEBUG_HIT_ZONE_FILL`/`STROKE`) as the alias for the
 * resize-handle category and any uncoloured fallback.
 */
export const DEBUG_HIT_ZONE_FILL = "#e8118c";
export const DEBUG_HIT_ZONE_STROKE = "#e8118c";
export const DEBUG_HIT_ZONE_FILL_OPACITY = 0.16;
export const DEBUG_HIT_ZONE_STROKE_OPACITY = 0.7;

/**
 * Per-category debug hit-zone colours. One hue per hit-target kind so the
 * overlay reads as a legend. Each colour is used for
 * BOTH the translucent fill and the outline of its zones.
 *
 * - `_RESIZE` — resize-handle slop squares (magenta).
 * - `_LINK_BODY` — link body select band (amber).
 * - `_LINK_HANDLE` — selected link's endpoint / waypoint / segment handles (blue).
 * - `_ANCHOR_START` — selected element's link-start dots (green).
 * - `_ATTACH_POINT` — link-attach named/edge anchor catchments, L1/L2 (cyan).
 * - `_ATTACH_EDGE` — link-attach outline band, L3 (purple).
 * - `_ATTACH_BODY` — link-attach floating-on-body region, L4 (yellow).
 * - `_FRAME` — frame membership zone, E1 (red).
 * - `_CONTAINER` — container drop-zone, E2–E4 (teal).
 */
export const DEBUG_ZONE_RESIZE = "#e8118c";
export const DEBUG_ZONE_LINK_BODY = "#f59e0b";
export const DEBUG_ZONE_LINK_HANDLE = "#2563eb";
export const DEBUG_ZONE_ANCHOR_START = "#16a34a";
export const DEBUG_ZONE_ATTACH_POINT = "#06b6d4";
export const DEBUG_ZONE_ATTACH_EDGE = "#a855f7";
export const DEBUG_ZONE_ATTACH_BODY = "#eab308";
export const DEBUG_ZONE_FRAME = "#dc2626";
export const DEBUG_ZONE_CONTAINER = "#14b8a6";
/** Annotation-pin grab radius (rose). Group-handle slop reuses `_RESIZE`. */
export const DEBUG_ZONE_ANNOTATION = "#f43f5e";

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
 * Opacity of the WYSIWYG shape-draw preview (the live rect / ellipse drawn
 * through its real renderer while dragging out a new shape). Slightly below
 * 1 so the in-progress shape reads as "not committed yet" while still
 * showing its true fill / stroke. Range: 0.7 (clearly tentative) – 1.0
 * (indistinguishable from a committed shape).
 */
export const DRAW_PREVIEW_OPACITY = 0.85;

/**
 * Opacity of the click-create ghost preview (hovering a start dot): the
 * faded would-be element + its connector, rendered through their real
 * renderers. Lower than DRAW_PREVIEW_OPACITY because the ghost is purely
 * speculative (a click away), not an in-progress gesture. Range: 0.3–0.5.
 */
export const GHOST_PREVIEW_OPACITY = 0.4;

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
 * Touch variants of the link-start anchor-dot hit zones (the dots that sit
 * just outside a selected element's edges). Mouse uses the small
 * {@link ANCHOR_START_HIT_SLOP} / {@link ANCHOR_DOT_CLICK_RADIUS}; on a
 * coarse pointer these grow to a finger-friendly ~16 px so the grab (start a
 * link drag) and click (create a linked element) zones are tappable. The
 * drawn dot stays the same size — only the hit area enlarges.
 */
export const TOUCH_ANCHOR_START_HIT_SLOP = 16;
export const TOUCH_ANCHOR_DOT_CLICK_RADIUS = 16;

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
/**
 * Time window (ms) within which a multi-key action sequence (e.g. `g`
 * then `d` to toggle the debug panel) must complete. Keys further apart
 * than this don't chain — the buffer prunes stale presses. 1 s matches
 * the "press g, then d" feel of vim-/Gmail-style sequence shortcuts.
 * Range: 500–2000.
 */
export const SEQUENCE_HOTKEY_WINDOW_MS = 1000;

/**
 * Arrow-key nudge step (world px) for the selection. Plain arrow moves by
 * `NUDGE_STEP_PX`; holding Shift moves by `NUDGE_STEP_SHIFT_PX` (coarse).
 */
export const NUDGE_STEP_PX = 1;
export const NUDGE_STEP_SHIFT_PX = 10;

export const CARET_BLINK_INTERVAL_MS = 530;
export const TEXT_SELECTION_FILL = "#1a73e8";
export const TEXT_SELECTION_OPACITY = 0.25;
export const TEXT_CARET_WIDTH_PX = 1.5;
export const TEXT_RESIZE_MIN_FONT_SIZE = 4;
