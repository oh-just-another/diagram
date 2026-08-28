/**
 * Tunable constants for the interaction layer (`Editor`, interaction
 * machine, snap engine, viewport math). Put any threshold / default /
 * timing the host might want to tweak here — keep magic numbers out
 * of the hot path code.
 */
import type { ArrowheadStyle, LinkRouting } from "@oh-just-another/scene";
import { UI_ACCENT } from "@oh-just-another/tokens";

/**
 * Single accent for all chrome drawn ON the canvas (selection, handles,
 * anchors, marquee, badges, text selection). One hex for both themes: the
 * canvas itself is always light (dark mode themes the DOM chrome only), so
 * no per-theme pair is needed. Equals the light `--du-accent` CSS value
 * (iris9), keeping canvas chrome and DOM chrome on one accent.
 */
export const CANVAS_CHROME_ACCENT: string = UI_ACCENT.light.accent;

/**
 * Translucent wash of {@link CANVAS_CHROME_ACCENT} for area highlights
 * (container drop-zone). Keep the rgb triplet in sync with the accent hex.
 */
export const CANVAS_CHROME_ACCENT_SOFT = "rgba(91, 91, 214, 0.10)";

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
 * Screen-pixel offset between a resize handle's centre and the shape's bbox
 * edge. 0 centres every handle exactly on the frame corner / edge midpoint;
 * a positive value pushes them outward so the grab area clears the body.
 * Range: 0–4.
 */
export const HANDLE_OUTSET = 0;

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
 * Screen-pixel gap between the shape's rotate anchor (default bottom-left
 * corner) and the rotate grip that floats just outside it. Far enough to clear
 * the corner resize handle. Range: 20–32.
 */
export const ROTATE_HANDLE_OFFSET = 26;

/**
 * Screen-pixel radius of the rotate grip's circular-arrow glyph (a clockwise
 * rotate icon). Slightly larger than `HANDLE_SIZE` so the icon reads as an
 * affordance, not a plain resize dot. Range: 6–9.
 */
export const ROTATE_ICON_RADIUS = 7;

/**
 * Angle step (radians) the rotate gesture snaps to while Shift is held — 15°
 * (π/12), the common increment for diagram alignment. Range: π/24–π/6.
 */
export const ROTATE_SNAP_RADIANS = Math.PI / 12;

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
 * accent / handle white so anchors share the resize-handle visual
 * language (they equal `DEFAULT_OVERLAY_STYLE.selectionStroke` / `.handleFill`).
 */
const ANCHOR_BRAND_COLOR = CANVAS_CHROME_ACCENT;
const ANCHOR_NEUTRAL_COLOR = "#fff";

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
 */
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
 *   normalisation. Per event:
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
 * - `MIN_ZOOM` / `MAX_ZOOM` — hard caps (1 % … 3200 %). Far out, the
 *   per-element screen-size LOD keeps the frame cheap while anything still
 *   large enough on screen stays fully drawn; above MAX_ZOOM pixel-snapping
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
export const MIN_ZOOM = 0.01;
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
 * Opacity of an element MARKED for erasing while the eraser is swept over it
 * (before the delete commits on pointer-up). Much lower than
 * {@link ISOLATION_DIM_OPACITY} so "about to be deleted" reads clearly at a
 * glance — matches the Excalidraw eraser's ~20% preview. Range: 0.15–0.4.
 */
export const ERASE_DIM_OPACITY = 0.2;

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
 * Default brush line colour — the paint a fresh stroke is committed with when
 * the host hasn't changed the drawing panel. A dark neutral that reads on a
 * light canvas (matches the pre-settings hard-coded value).
 */
export const DEFAULT_BRUSH_COLOR = "#222222";

/**
 * Default brush opacity (0–1) for a fresh stroke. 1 = fully opaque.
 */
export const DEFAULT_BRUSH_OPACITY = 1;

/**
 * Samples per Catmull-Rom span when smoothing a committed brush stroke. Brush
 * points are captured sparsely (one per pointer-move), so the raw polyline is
 * angular; on commit each span is resampled into this many sub-points along a
 * Catmull-Rom curve through the captured points (interpolating per-point width
 * too), baking a smooth stroke into the scene. Higher = smoother but more stored
 * vertices per stroke. Range: 2–8.
 */
export const BRUSH_SMOOTH_SEGMENTS = 4;

/**
 * Input-time low-pass (streamline) strength for brush capture, 0-0.9. Each
 * pointer-move stores a point pulled only `1 - BRUSH_STREAMLINE` of the way
 * from the previous stored point toward the raw sample, filtering hand jitter
 * and sensor noise into a steady line. 0 = raw input (off); higher = steadier
 * but laggier (the commit-time catch-up point hides the lag at the stroke
 * end). Range: 0.3-0.7.
 */
export const BRUSH_STREAMLINE = 0.5;

/**
 * Per-sample lerp rate (0-1) toward the target pressure while capturing a
 * brush stroke — rate-limits pressure changes so a single outlier sample (pen
 * lift-off spike, sudden speed jump on mouse) can't kink the width profile.
 * 1 = follow instantly (off); lower = smoother but slower to adapt. 0.3 keeps
 * the width felt-tip steady. Range: 0.2-0.7.
 */
export const BRUSH_PRESSURE_SMOOTHING = 0.3;

/**
 * Screen-pixel distance per pointer sample at which SIMULATED pressure (mouse /
 * touch — no real pressure channel) bottoms out. Standing still targets full
 * pressure (thick); moving this fast per sample targets the minimum (thin) —
 * the "slower = thicker" response. Measured in screen px so the feel is
 * zoom-independent. 32 keeps the speed response gentle (marker-like); halve it
 * for a livelier calligraphic feel. Range: 8-48.
 */
export const BRUSH_SIM_THIN_DIST_PX = 32;

/**
 * Floor for simulated brush pressure (0-1) — the width multiplier a fast
 * mouse / touch stroke converges to (`× base width`). Together with
 * BRUSH_SIM_PRESSURE_MAX it sets the width band of a simulated stroke: a
 * narrow band (0.55-0.7, the default) reads as a felt-tip marker; widen it
 * (e.g. 0.25-0.8) for a pen-like thin-thick response. Range: 0.15-0.7.
 */
export const BRUSH_SIM_PRESSURE_MIN = 0.55;

/**
 * Ceiling for simulated brush pressure (0-1) — the width multiplier a slow /
 * stationary mouse or touch stroke converges to (`× base width`). Without a
 * ceiling a slow stroke fattens all the way to the full base width, which
 * reads too thick next to the medium-speed line. See BRUSH_SIM_PRESSURE_MIN
 * for the band the two clamps form. Real pen pressure is not clamped.
 * Range: 0.6-1.
 */
export const BRUSH_SIM_PRESSURE_MAX = 0.7;

/**
 * Initial simulated pressure (0-1) for the first sample of a mouse / touch
 * stroke. A felt-tip touches the paper at full width, so it starts at the
 * BRUSH_SIM_PRESSURE_MAX ceiling and thins as the stroke speeds up. Keep
 * within the [MIN, MAX] clamp band. Range: 0.4-0.7.
 */
export const BRUSH_SIM_PRESSURE_START = 0.7;

/**
 * Minimum SCREEN-pixel displacement of the raw input before a new brush point
 * is stored — decimation of near-duplicate pointer samples (120 Hz devices
 * emit far more moves than a stroke needs). Skipped samples still update the
 * commit catch-up point. Smaller = denser capture; larger = coarser but
 * cheaper strokes. Range: 1-4.
 */
export const BRUSH_MIN_POINT_DIST_PX = 1.5;

/**
 * Soft cap on captured brush points per stroke. When capture exceeds it, the
 * stroke's interior points are halved (endpoints kept), bounding memory and
 * render cost on very long strokes — each halving doubles the remaining
 * capacity instead of stopping the stroke. Range: 1024-8192.
 */
export const MAX_BRUSH_POINTS = 2048;

/**
 * Length of the end taper of a brush stroke, as a multiple of the base
 * half-width — arc length from each tip over which the width eases down.
 * Capped at half the stroke length so short strokes stay symmetric. 0 (the
 * default) disables tapering: blunt round caps, the felt-tip marker look.
 * Set 2-5 for pen-like ends that trail off to a point. Range: 0-5.
 */
export const BRUSH_TAPER_LENGTH_FACTOR = 0;

/**
 * Width factor at the very tip of a tapered brush stroke (0-1 of the captured
 * width) — the tip converges to this instead of a full-width round cap,
 * mimicking a pen lifting off. Range: 0.05-0.3.
 */
export const BRUSH_TAPER_MIN = 0.1;

/**
 * World-pixel distance under which a brush stroke's last point is treated as
 * meeting its first — the trigger for auto-closing (and filling) a stroke on
 * commit. Only applies when a fill colour is set and the stroke has ≥3 points.
 * Scaled to the max stroke width so a thick stroke closes as forgivingly as it
 * looks. Range: 6–30; larger closes more eagerly. Default: `MAX_BRUSH_WIDTH * 3`.
 */
export const BRUSH_CLOSE_DISTANCE = MAX_BRUSH_WIDTH * 3;

/**
 * Eraser sampling step in WORLD units. While the eraser is dragged the host
 * hit-tests points spaced this far apart along the pointer path so a fast
 * swipe doesn't skip over small shapes between two move events. Smaller →
 * more hit-tests per move (safer, costlier); larger → cheaper but can jump a
 * thin shape. 6 px matches the default brush width so nothing narrower than a
 * stroke slips through. Range: 3–12.
 */
export const ERASER_SAMPLE_STEP = 6;

/**
 * Stroke colour of the eraser cursor ring (and its fading drag trail). A neutral
 * mid-grey so it reads on both light and dark canvases without looking like a
 * tool accent. Range: any mid-luminance grey (#666–#aaa).
 */
export const ERASER_CURSOR_STROKE = "#888888";

/**
 * Screen-pixel line width of the eraser cursor ring. Constant on screen (the
 * ring is drawn in screen space) so it stays crisp at any zoom. Range: 1–3.
 */
export const ERASER_CURSOR_LINE_WIDTH = 1.5;

/**
 * Lifetime (ms) of an eraser drag-trail point before it fully fades — the knob
 * for how LONG the eraser wake is. Much shorter than {@link LASER_TRAIL_TTL_MS}
 * (the laser comet) so the eraser leaves only a tight, brief wake behind the
 * cursor, matching Excalidraw. Lower = shorter/snappier. Range: 100–400.
 */
export const ERASER_TRAIL_TTL_MS = 120;

/**
 * Deepest list nesting level reachable via Tab / the indent buttons
 * (0-based, so 8 = nine visual levels). Guards runaway indents that
 * would push items past the wrap budget. Reasonable range 4–10.
 */
export const MAX_LIST_INDENT = 8;

/**
 * Font size a freshly-created embedded shape label starts with (world
 * units). Smaller than `TEXT_DEFAULT_FONT_SIZE` — labels live inside a
 * bounded shape body. Reasonable range 12–20.
 */
export const LABEL_DEFAULT_FONT_SIZE = 16;

/**
 * Sticky-note size presets (square side in world units) behind the
 * toolbar's S / M / L segments. Reasonable range 100–300.
 */
export const STICKY_SIZE_PRESETS: readonly { id: "s" | "m" | "l"; side: number }[] = [
  { id: "s", side: 120 },
  { id: "m", side: 160 },
  { id: "l", side: 220 },
];

/**
 * Frame size presets for the frame toolbar's ratio dropdown. Applying one
 * resizes the frame to the canonical size (world units ≈ CSS px at zoom 1),
 * keeping its top-left corner; free resizing afterwards simply diverges
 * from the preset (nothing is stored on the element). Sizes are the
 * common paper / screen defaults and safe to tune.
 */
export interface FrameSizePreset {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

export const FRAME_SIZE_PRESETS: readonly FrameSizePreset[] = [
  { id: "a4", label: "A4", width: 794, height: 1123 },
  { id: "letter", label: "Letter", width: 816, height: 1056 },
  { id: "16:9", label: "16:9", width: 1280, height: 720 },
  { id: "4:3", label: "4:3", width: 1024, height: 768 },
  { id: "1:1", label: "1:1", width: 800, height: 800 },
  { id: "phone", label: "Phone", width: 390, height: 844 },
  { id: "tablet", label: "Tablet", width: 820, height: 1180 },
  { id: "browser", label: "Browser", width: 1280, height: 800 },
];

/**
 * Stroke-eraser (Shift) samples a brush polyline this densely — as a FRACTION of
 * the eraser radius — when computing which arc-length spans fall under the disc.
 * The eraser cuts the line's GEOMETRY (segments), not just its vertices, so a big
 * disc merely grazing a sparsely-sampled stroke still removes the covered span.
 * Smaller = finer edges / more samples per move; larger = coarser / cheaper. The
 * covered-span endpoints are refined by bisection ({@link ERASE_BOUNDARY_BISECT_ITERS})
 * regardless, so this mainly bounds the miss-a-tiny-dip risk. Range: 0.15–0.5.
 */
export const ERASE_COVERAGE_SAMPLE_FRACTION = 0.25;

/**
 * Floor (world units) for the stroke-eraser sample step, so a tiny eraser radius
 * doesn't explode the sample count on a long stroke. Range: 0.25–2.
 */
export const ERASE_COVERAGE_MIN_SAMPLE_STEP = 0.5;

/**
 * Bisection iterations used to pin each covered-span endpoint to the eraser ring
 * (where the brush polyline crosses distance = radius). Each iteration halves the
 * error, so 10 ≈ step/1024 — visually exact. Range: 6–14.
 */
export const ERASE_BOUNDARY_BISECT_ITERS = 10;

/**
 * A surviving stroke-eraser fragment shorter than this arc length (world units)
 * is dropped as litter — an isolated nub reads as a stray dot, not a line. Range:
 * 0.5–3.
 */
export const ERASE_FRAGMENT_MIN_ARC = 1;

/**
 * Lifetime (ms) of a laser-pointer trail point before it fully fades. Each
 * point stores its birth time; the overlay ramps its opacity from 1 → 0 over
 * this window and the editor prunes points older than it, so a stroke trails
 * the cursor like a comet and vanishes ~this long after the pointer stops.
 * "A couple of seconds" — range 800–3000.
 */
export const LASER_TRAIL_TTL_MS = 1400;

/**
 * Stroke colour of the laser-pointer trail. A saturated red reads as a
 * presentation laser and stands out over any diagram fill.
 */
export const LASER_COLOR = "#ff2d2d";

/**
 * Screen-pixel stroke width of the laser trail. Constant on screen (drawn in
 * screen space, not world) so the beam stays the same thickness at every zoom.
 * Range: 2–6.
 */
export const LASER_WIDTH = 4;

/**
 * Samples per Catmull-Rom span when smoothing a laser trail for rendering.
 * Laser points are collected sparsely (one per pointer-move), so the raw
 * polyline looks angular; the overlay resamples each span into this many
 * sub-points along a Catmull-Rom curve through the captured points, keeping the
 * beam smooth. Higher = smoother but more segments per frame. Range: 4–16.
 */
export const LASER_SMOOTH_SEGMENTS = 8;

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
 * Placeholder size (world px, 16:9) for a dropped video whose metadata never
 * loads (`videoWidth`/`videoHeight` = 0 — unsupported codec, aborted load).
 * Only affects the created element's initial box. Range: 160×90 – 960×540.
 */
export const VIDEO_FALLBACK_WIDTH_PX = 480;
export const VIDEO_FALLBACK_HEIGHT_PX = 270;

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
 */
export const TEXT_DEFAULT_FONT_SIZE = 24;
export const TEXT_DEFAULT_FONT_FAMILY = "system-ui, sans-serif";
export const TEXT_DEFAULT_FILL = "#1a1a1a";

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
export const TEXT_SELECTION_FILL: string = CANVAS_CHROME_ACCENT;

/**
 * Object snapping / size assists (see `EditorPreferences`).
 * - `OBJECT_SNAP_THRESHOLD_PX` — screen distance within which a dragged
 *   edge / centre snaps to another shape's. Range: 4–10.
 * - `OBJECT_SNAP_MIN_SIZE_PX` / `OBJECT_SNAP_MAX_CANDIDATES` — which shapes
 *   count as snap targets (see below).
 * - `SIZE_SUGGEST_THRESHOLD_PX` — screen distance within which a resized
 *   width / height snaps to a nearby shape's size. Range: 4–10.
 * - `SNAP_GUIDE_*` / `SNAP_MEASURE_*` — alignment guide and distance segment
 *   chrome (reference look: dashed guide, ticked measure with a label).
 * - `SIZE_READOUT_*` — the `W × H` pill under a shape being resized:
 *   font size, padding, and gap below the shape's bottom edge (screen px).
 */
export const OBJECT_SNAP_THRESHOLD_PX = 6;
/**
 * Snap-target eligibility (reference rules): a shape must be at least this
 * many screen px wide OR tall to be snapped to, and object snapping is
 * skipped entirely when more than `OBJECT_SNAP_MAX_CANDIDATES` shapes are
 * on screen (keeps a huge board responsive). Ranges: 12–24 / 500–5000.
 */
export const OBJECT_SNAP_MIN_SIZE_PX = 18;
export const OBJECT_SNAP_MAX_CANDIDATES = 2000;
export const SIZE_SUGGEST_THRESHOLD_PX = 6;
/** Alignment guide: dashed line through the aligned edges / centres. */
export const SNAP_GUIDE_COLOR = "#2a78ff";
export const SNAP_GUIDE_WIDTH_PX = 1;
export const SNAP_GUIDE_DASH: readonly number[] = [4, 4];
/** How far (screen px) the guide runs past the outermost of the two shapes. */
export const SNAP_GUIDE_OVERSHOOT_PX = 15;
/**
 * Distance segments: solid line with perpendicular ticks at both ends,
 * inset from the shapes it measures, labelled with the rounded distance.
 * `SNAP_SIZE_SEGMENT_OFFSET_PX` — gap between a shape and the segment that
 * measures its width (above) / height (left) on a size match.
 */
export const SNAP_MEASURE_COLOR = "#4262ff";
export const SNAP_MEASURE_INSET_PX = 4;
export const SNAP_MEASURE_TICK_PX = 3;
export const SNAP_MEASURE_LABEL_GAP_PX = 3;
export const SNAP_SIZE_SEGMENT_OFFSET_PX = 15;
export const SIZE_READOUT_FONT_SIZE = 11;
export const SIZE_READOUT_PADDING_X = 6;
export const SIZE_READOUT_PADDING_Y = 3;
export const SIZE_READOUT_OFFSET_PX = 8;
export const SIZE_READOUT_RADIUS_PX = 4;
export const SIZE_READOUT_FILL: string = CANVAS_CHROME_ACCENT;
export const SIZE_READOUT_TEXT_COLOR = "#fff";
export const TEXT_SELECTION_OPACITY = 0.25;
export const TEXT_CARET_WIDTH_PX = 1.5;
export const TEXT_RESIZE_MIN_FONT_SIZE = 4;

/**
 * Multiplicative step for the increase/decrease-font-size shortcuts: each
 * press scales the current size by this factor (min ±1 px so small sizes still
 * move), clamped to {@link TEXT_RESIZE_MIN_FONT_SIZE}…{@link TEXT_MAX_FONT_SIZE}.
 * 1.1 ≈ a gentle 10 % step. Range: 1.05–1.5.
 */
export const TEXT_FONT_SIZE_STEP = 1.1;

/**
 * Gap (world px) between a source node and the connected node spawned by the
 * flowchart create shortcut (`Cmd/Ctrl+Arrow`). Measured from the source's
 * edge to the new node's edge along the spawn direction. Range: 40–160 —
 * enough that the connecting link is clearly visible.
 */
export const SPAWN_CONNECTED_GAP_PX = 80;

/**
 * Upper cap on how many sibling nodes a single flowchart create session
 * (`Cmd/Ctrl+Arrow` held, tapped an arrow repeatedly) can pending-grow before
 * commit. Guards against an accidental key-repeat spraying dozens of nodes.
 * Range: 4–16.
 */
export const FLOWCHART_MAX_SIBLINGS = 8;

/**
 * Opacity of the pending flowchart-create preview (the not-yet-committed
 * nodes + links drawn on the overlay while `Cmd/Ctrl` is held). Below 1 so the
 * preview reads as provisional, high enough to judge placement. Range:
 * 0.35–0.65.
 */
export const FLOWCHART_PREVIEW_OPACITY = 0.5;

/**
 * Upper clamp (world px) for font size — matches the property panel's slider
 * ceiling so the keyboard and the panel agree on the maximum.
 */
export const TEXT_MAX_FONT_SIZE = 256;

/**
 * Paused-GIF chip drawn in a shape's top-left corner — signals a GIF the
 * user can click / hover to resume. Dimensions in screen px; the scrim is
 * a translucent black so the "gif" label stays legible over any artwork.
 */
export const GIF_BADGE_W = 30;
export const GIF_BADGE_H = 16;
export const GIF_BADGE_PAD = 4;
export const GIF_BADGE_RADIUS = 4;
export const GIF_BADGE_BG_COLOR = "rgba(0,0,0,0.65)";

/**
 * Padlock badge at a selected locked element's top-right corner. `SIZE` is
 * the icon edge in screen px; the body uses the accent colour, the keyhole
 * a contrasting fill.
 */
export const LOCK_BADGE_SIZE = 16;
export const LOCK_BADGE_COLOR: string = CANVAS_CHROME_ACCENT;
export const LOCK_BADGE_KEYHOLE_COLOR = "#fff";

/**
 * Image-crop UX (Excalidraw-style handle cropping).
 *
 * - `CROP_MIN_SIZE` — smallest allowed crop window edge, in element-LOCAL
 *   units (unscaled). Dragging an edge handle inward stops here so the window
 *   can never collapse to zero. Range: 4–24.
 * - `CROP_HANDLE_HIT_RADIUS` — screen-pixel grab radius around each of the 8
 *   crop handles. Divided by zoom before hit-testing so the effective screen
 *   target stays constant. Mirrors {@link HANDLE_HIT_SLOP}. Range: 8–14.
 * - `CROP_GHOST_OPACITY` — alpha of the faint full-image "ghost" painted over
 *   the virtual full-image rect while cropping, so the user sees the hidden
 *   parts of the source. Low so the real (cropped) pixels stay dominant.
 *   Range: 0.08–0.2.
 * - `CROP_BRACKET_LEN` — arm length (screen px) of the L-shaped corner brackets
 *   that mark the crop frame (Excalidraw-style), drawn instead of round nubs.
 *   Range: 10–20.
 * - `CROP_BRACKET_WIDTH` — stroke width (screen px) of those brackets. Thicker
 *   than the frame outline so the corners read as grabbable. Range: 2–4.
 */
export const CROP_MIN_SIZE = 10;
export const CROP_HANDLE_HIT_RADIUS = 11;
export const CROP_GHOST_OPACITY = 0.12;
export const CROP_BRACKET_LEN = 14;
export const CROP_BRACKET_WIDTH = 3;

/**
 * Snap radius (screen px) of the caption drag: while the pill's arc-length
 * position is within this distance of the path middle, the explicit
 * `label.position` is dropped and the label returns to its default placement
 * (midpoint / elbow longest-segment). Range: 4–16.
 */
export const LINK_LABEL_DRAG_SNAP_PX = 8;

/**
 * Aspect presets for the image mask picker. Applying one centre-crops
 * the source to the target aspect (`Editor.setImageAspectPreset`) and
 * refits the element box; `circle` additionally installs an ellipse
 * mask on the square box. Values are width / height ratios.
 */
export const IMAGE_ASPECT_PRESETS = {
  circle: 1,
  square: 1,
  portrait: 3 / 4,
  landscape: 4 / 3,
  wide: 16 / 9,
} as const;

export type ImageAspectPreset = keyof typeof IMAGE_ASPECT_PRESETS | "original";

/**
 * Sticky-note colour palette. Converting a shape / text into a sticky
 * snaps its fill to the NEAREST of these (RGB distance) so stickies stay
 * within the classic sticky look; the first entry is the default yellow
 * (matches renderer-core `STICKY_DEFAULT_FILL`).
 */
export const STICKY_PALETTE: readonly string[] = [
  "#fff9b1", // yellow (default)
  "#f5f6f8", // gray
  "#d5f692", // light green
  "#a6ccf5", // light blue
  "#67c6c0", // teal
  "#ffcee0", // pink
  "#ff9d48", // orange
  "#b384bb", // purple
];

/**
 * "Shapes and lines" flyout: the shape kind armed by a shape row. The
 * rubber-band draw gesture then creates that kind (diamond / triangle
 * materialise as polygons inscribed in the dragged box).
 */
export type DrawShapeKind = "rect" | "ellipse" | "diamond" | "triangle";

/**
 * "Shapes and lines" flyout: connector presets armed by the line rows.
 * Overrides applied to NEW links drawn in `draw-edge` mode (and the
 * live preview): `line` — straight, no arrowhead; `arrow` — straight
 * with the default arrowhead; `elbow` — orthogonal with the default
 * arrowhead (same as the bare draw-edge tool).
 */
export type LinkDrawPreset = "line" | "arrow" | "elbow";

export const LINK_DRAW_PRESETS: Readonly<
  Record<
    LinkDrawPreset,
    { readonly routing: "straight" | "orthogonal"; readonly arrowheadTo: "triangle" | null }
  >
> = {
  line: { routing: "straight", arrowheadTo: null },
  arrow: { routing: "straight", arrowheadTo: "triangle" },
  elbow: { routing: "orthogonal", arrowheadTo: "triangle" },
};

/**
 * Gap (world units) between cells / stacked units of "Arrange as grid" and
 * "Stack horizontally / vertically" when the caller passes none. Range: 8–32.
 */
export const ARRANGE_LAYOUT_GAP = 16;

/**
 * How the editor routes `wheel` events.
 * - `"auto"` — per-event heuristic: any horizontal delta reads as a trackpad
 *   swipe (pan), a pure vertical delta as a mouse wheel (zoom).
 * - `"mouse"` — the wheel zooms; Shift + wheel pans sideways; a tilt wheel
 *   (horizontal-only delta) pans.
 * - `"trackpad"` — two-finger swipes pan on both axes; pinch (Ctrl/Cmd +
 *   wheel) zooms.
 * Ctrl / Cmd + wheel zooms in every mode.
 */
export type WheelMode = "auto" | "mouse" | "trackpad";

/**
 * Per-user editor preferences — device / assist settings that are NOT part
 * of the document (hosts persist them per browser, e.g. `localStorage`).
 * - `snapObjects` — snap moved / resized shapes to the edges and centres of
 *   nearby shapes, with alignment guides.
 * - `showObjectSize` — show a `W × H` readout under a shape while resizing.
 * - `suggestObjectSize` — while resizing, snap to the width / height of
 *   nearby shapes and highlight the matched one.
 * - `wheelMode` — see {@link WheelMode}.
 */
export interface EditorPreferences {
  readonly snapObjects: boolean;
  readonly showObjectSize: boolean;
  readonly suggestObjectSize: boolean;
  readonly wheelMode: WheelMode;
}

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  snapObjects: true,
  showObjectSize: true,
  suggestObjectSize: true,
  wheelMode: "auto",
};

/**
 * Frame-cost statistics ({@link Editor.frameStats}).
 * - `FRAME_COST_EMA_ALPHA` — weight of the newest frame in the cost and
 *   frame-gap EMAs. 0.2 ≈ a 5-frame memory; higher reacts faster but
 *   flickers. Range 0.05–0.5.
 * - `FRAME_INTERVAL_MAX_MS` — frame gaps longer than this (hidden tab, idle)
 *   are ignored by the gap EMA. Range 100–1000.
 * - `FRAME_REFRESH_RATES_HZ` — candidate display rates the refresh probe
 *   snaps to. Add exotic panels here.
 * - `REFRESH_PROBE_IDLE_MS` — the display rate is measured by a probe of
 *   empty `requestAnimationFrame` callbacks that runs only after this long
 *   without a paint, so nothing of ours stretches the gaps; main-thread
 *   work during a probe aborts it. Range 300–2000.
 * - `REFRESH_PROBE_FRAMES` — callbacks per probe; the median gap is used.
 *   Range 6–30.
 */
export const FRAME_COST_EMA_ALPHA = 0.2;
export const FRAME_INTERVAL_MAX_MS = 250;
export const FRAME_REFRESH_RATES_HZ: readonly number[] = [
  30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240, 360,
];
export const REFRESH_PROBE_IDLE_MS = 600;
export const REFRESH_PROBE_FRAMES = 12;
