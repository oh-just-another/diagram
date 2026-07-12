import type { AnnotationId, Bounds, ElementId, Transform, Vec2 } from "@oh-just-another/types";
import {
  getAnnotationWorldPosition,
  getElementWorldBounds,
  getWorldToScreen,
  isGroup,
  brushOutline,
  type Annotation,
  type Element,
  type ImageElement,
  type Scene,
} from "@oh-just-another/scene";
import { bounds as B, matrix } from "@oh-just-another/math";
import {
  getElementRenderer,
  resolveImageSource,
  strokeRoundedPolyline,
  LINK_CORNER_RADIUS,
  type RenderTarget,
} from "@oh-just-another/renderer-core";
import {
  ANCHOR_DOT_ACTIVE_RADIUS,
  ANCHOR_DOT_RADIUS,
  ANCHOR_DOT_STROKE_WIDTH,
  ANNOTATION_PIN_BADGE_FONT_SIZE,
  ANNOTATION_PIN_FILL,
  ANNOTATION_PIN_RADIUS,
  ANNOTATION_PIN_RESOLVED_FILL,
  ANNOTATION_PIN_STROKE,
  CURSOR_ARROW_SIZE,
  CURSOR_NAME_CHIP_OFFSET,
  CURSOR_NAME_CHIP_PADDING_X,
  CURSOR_NAME_CHIP_PADDING_Y,
  CURSOR_NAME_FONT_SIZE,
  CROP_BRACKET_LEN,
  CROP_BRACKET_WIDTH,
  CROP_GHOST_OPACITY,
  DRAW_PREVIEW_OPACITY,
  FLOWCHART_PREVIEW_OPACITY,
  GHOST_PREVIEW_OPACITY,
  LINK_ATTACH_ANCHOR_FILL,
  LINK_ATTACH_ANCHOR_STROKE,
  LINK_ENDPOINT_HANDLE_DRAW_RADIUS,
  LINK_MIDPOINT_HANDLE_DRAW_RADIUS,
  SELECTION_HALO_PEEK_PX,
  LINK_START_ANCHOR_FILL,
  LINK_START_ANCHOR_STROKE,
  PEER_SELECTION_DASH,
  PEER_SELECTION_PADDING,
  PEER_SELECTION_STROKE_WIDTH,
  TEXT_CARET_WIDTH_PX,
  TEXT_SELECTION_FILL,
  TEXT_SELECTION_OPACITY,
  GIF_BADGE_W,
  GIF_BADGE_H,
  GIF_BADGE_PAD,
  GIF_BADGE_RADIUS,
  GIF_BADGE_BG_COLOR,
  LOCK_BADGE_SIZE,
  LOCK_BADGE_COLOR,
  LOCK_BADGE_KEYHOLE_COLOR,
  ROTATE_ICON_RADIUS,
  LASER_COLOR,
  LASER_WIDTH,
  LASER_TRAIL_TTL_MS,
  ERASER_CURSOR_STROKE,
  ERASER_CURSOR_LINE_WIDTH,
  ERASER_TRAIL_TTL_MS,
} from "./constants.js";
import { smoothLaserPoints, type LaserStroke } from "./editor/public/laser.js";
import {
  CORNER_HANDLES,
  HANDLE_SIZE,
  frameCorners,
  handlePosition,
  handleWorldOnFrame,
  rotateGripForBounds,
  rotateGripWorld,
  shapeSelectionFrame,
  type SelectionFrame,
} from "./handle.js";
import { isResizable } from "./editor/shape-traits.js";
import {
  drawHitZones,
  hitZoneVisibility,
  type HitZoneAttach,
  type HitZoneContainers,
  type HitZoneVisibility,
} from "./editor/hit-test.js";
import type { Selection } from "./selection.js";

import { req } from "./util.js";

/**
 * Union AABB of every direct child of `groupId` (recursive). Returns
 * `null` for empty groups so callers can skip the outline pass. Used
 * by the selection overlay to draw a halo around grouped shapes.
 */
const groupWorldBounds = (scene: Scene, groupId: ElementId): Bounds | null => {
  let acc: Bounds | null = null;
  for (const shape of scene.elements.values()) {
    if (shape.parentId !== groupId) continue;
    const inner = isGroup(shape) ? groupWorldBounds(scene, shape.id) : getElementWorldBounds(shape);
    if (!inner) continue;
    acc = acc ? B.union(acc, inner) : inner;
  }
  return acc;
};

export interface OverlayStyle {
  readonly selectionStroke: string;
  readonly selectionStrokeWidth: number;
  readonly handleFill: string;
  readonly handleStroke: string;
  readonly drawingStroke: string;
  readonly drawingDash: readonly number[];
}

export const DEFAULT_OVERLAY_STYLE: OverlayStyle = {
  selectionStroke: "#1a73e8",
  selectionStrokeWidth: 1,
  handleFill: "#fff",
  handleStroke: "#1a73e8",
  drawingStroke: "#1a73e8",
  drawingDash: [4, 4],
};

/** Translucent fill opacity for the under-shape selection halo. */
const SELECTION_HALO_OPACITY = 0.32;

/**
 * One selected element's contour halo: its outline loop(s) plus `outsetWorld`
 * — how far the element's own border extends OUTSIDE the contour (world
 * units; see `strokeOutsideExtent`). The halo is sized so it peeks exactly
 * `SELECTION_HALO_PEEK_PX` screen px beyond contour + outset.
 */
export interface ElementHalo {
  readonly loops: readonly (readonly Vec2[])[];
  readonly outsetWorld: number;
}

/**
 * Paint the contour selection halo for elements — a translucent stroke
 * hugging each world-space outline loop. Drawn on the dedicated background
 * layer (under the shapes) so it peeks out from behind them. The stroke is
 * centred on the contour with width `2 × (outset + peek/zoom)`, so its outer
 * edge lands exactly `peek` screen px beyond the element's VISIBLE edge
 * (contour + border outset) at every zoom and border thickness. Sets the
 * world transform itself; resets to identity at the end.
 */
export const paintElementSelectionHalo = (
  target: RenderTarget,
  w2s: Transform,
  halos: readonly ElementHalo[],
  zoom: number,
  style: OverlayStyle = DEFAULT_OVERLAY_STYLE,
): void => {
  if (halos.length === 0) return;
  const z = zoom || 1;
  const peekWorld = SELECTION_HALO_PEEK_PX / z;
  target.setTransform(w2s);
  target.setStroke(style.selectionStroke);
  target.setOpacity(SELECTION_HALO_OPACITY);
  target.setDashArray(null);
  // Miter join so the halo reproduces the element's own corners (sharp on a
  // rectangle / polygon, pointed on a star); rounded corners come from the
  // traced outline points (rounded-rect / ellipse), not the join.
  target.setLineJoin("miter");
  target.setLineCap("butt");
  for (const { loops, outsetWorld } of halos) {
    // Centred stroke → outer edge sits (width/2) past the contour. We want
    // that to be outset + peek, so width = 2 × (outset + peek).
    target.setStrokeWidth(2 * (outsetWorld + peekWorld));
    for (const loop of loops) {
      if (loop.length < 2) continue;
      target.beginPath();
      let started = false;
      for (const p of loop) {
        if (started) target.lineTo(p.x, p.y);
        else {
          target.moveTo(p.x, p.y);
          started = true;
        }
      }
      target.closePath();
      target.stroke();
    }
  }
  target.setOpacity(1);
  target.setTransform(matrix.IDENTITY);
};

/**
 * Set of world-space points to render as port dots — used when the editor
 * wants to show "you can attach here" affordances on a hovered shape in
 * draw-edge mode.
 */
export interface PortOverlay {
  readonly worldPoints: readonly Vec2[];
  /** Highlight one of the points (the snap target). Optional. */
  readonly activeIndex?: number;
  /**
   * Screen-px radius to draw the active dot at — lets the host scale it
   * smoothly by cursor proximity (link-start grow). Falls back to
   * `ANCHOR_DOT_ACTIVE_RADIUS` when unset.
   */
  readonly activeRadius?: number;
  /**
   * Visual role (standard model).
   *   - link-start: shown on selection (where to drag from).
   *   - link-attach: shown on hover / proximity (where to land).
   */
  readonly role?: "link-start" | "link-attach";
}

/**
 * Selected edge with endpoint world positions. Renderer paints small
 * handles on each end so the user can grab and re-bind them.
 */
export interface LinkSelection {
  readonly from: Vec2;
  readonly to: Vec2;
  /** Existing bend points (world) — solid grab handles. */
  readonly waypoints?: readonly Vec2[];
  /** Segment midpoints (world) — smaller "add waypoint" handles. */
  readonly midpoints?: readonly Vec2[];
}

/**
 * Remote peer's cursor — world-space position plus identity. Rendered
 * as a coloured arrow + name chip so the user can see who's pointing
 * where. The local user's cursor is never in this list (the host
 * filters by `clientId !== localId` before passing).
 */
export interface PeerCursor {
  readonly position: Vec2;
  readonly color: string;
  readonly name: string;
}

/**
 * Remote peer's selection — world-space bounding boxes that draw a
 * dashed outline in the peer's colour. Computed by the host from the
 * peer's `selection: ElementId[]` and the current scene shapes.
 */
export interface PeerSelection {
  readonly color: string;
  readonly bounds: readonly Bounds[];
}

/**
 * Full option set accepted by {@link renderOverlay}. Every field is a distinct
 * overlay layer; the orchestrator supplies only the ones it wants painted this
 * frame. Split out of the function signature so the per-section renderers can
 * share a typed context (see {@link OverlayCtx}).
 */
export interface OverlayOptions {
  /**
   * Image-crop frame: the world-space corners (clockwise, 4 points) of the
   * pending crop region while in crop mode. Painted as a dashed accent quad
   * with L-shaped corner brackets so the user sees what will be kept and can
   * grab the corners. Honours rotation. Its presence also suppresses the
   * normal per-shape and group-bounds resize/rotate handles.
   */
  cropFrame?: readonly Vec2[];
  /**
   * Crop-mode ghost: the original image element (transform + live bitmap) and
   * the virtual full-image LOCAL rect the whole bitmap occupies. Painted first
   * (behind the crop chrome) at {@link CROP_GHOST_OPACITY} so the parts hidden
   * by the crop window stay faintly visible. Skipped gracefully when no live
   * bitmap handle is available.
   */
  cropGhost?: { readonly element: Element; readonly fullRect: Bounds };
  drawingPreview?: Bounds;
  /**
   * WYSIWYG preview of the shape being drawn by drag (rect / ellipse):
   * the would-be `Element` rendered through its real renderer so the
   * user sees exactly the shape + default style they'll get on release
   * (modern-style), instead of only a dashed rubber-band rect. Mutually
   * exclusive with `drawingPreview` — the orchestrator sets one or the
   * other (dashed only for the lasso / select rubber-band).
   */
  drawingPreviewElement?: Element;
  /**
   * Pending flowchart-create nodes (Cmd/Ctrl+Arrow grow session). Each is
   * rendered through its real renderer at {@link FLOWCHART_PREVIEW_OPACITY} so
   * the user previews the shapes that will be created; the connecting links are
   * drawn separately by the orchestrator at the same opacity.
   */
  flowchartPreviewElements?: readonly Element[];
  /**
   * Live stroke-erase fragments (Shift eraser drag). The would-be brush
   * fragments for every touched brush, drawn through their real renderer at full
   * opacity — the touched originals are already hidden in the main pass, so this
   * shows the cut WYSIWYG. Drawn per-element (NOT via `renderScene`, which would
   * clear the overlay and wipe the eraser cursor / trail).
   */
  strokeErasePreviewElements?: readonly Element[];
  /**
   * Port-dot affordances to paint. A single set (one shape's anchors)
   * or several sets at once — e.g. the source's link-start dots AND the
   * target's link-attach dots simultaneously while a link is dragged
   * from a start anchor.
   */
  ports?: PortOverlay | readonly PortOverlay[];
  edgeSelection?: LinkSelection;
  /**
   * World-space polylines (+ visual width) of every SELECTED link, painted
   * as a persistent selection halo. Multi-select shows N halos; the sole-
   * link endpoint/bend handles are still driven by `edgeSelection`.
   */
  selectedLinkPaths?: readonly { readonly path: readonly Vec2[]; readonly width: number }[];
  /**
   * World-space bounds of the element a connector endpoint will FLOAT-attach
   * to (drop on the body, not a dot). Painted as a brand outline so the user
   * sees "this whole object" vs a specific point.
   */
  linkAttachHighlight?: Bounds;
  /**
   * Fallback bounds for the click-create ghost when no `ghostElementShape`
   * is available — painted as a faded brand rect outline. Prefer
   * `ghostElementShape` (the real shape). The connector is drawn separately
   * by the orchestrator through the real link renderer.
   */
  ghostElement?: Bounds;
  /**
   * The would-be element itself (same-kind clone of the source) for the
   * click-create ghost. When set it is rendered through its real renderer
   * so the ghost looks like the actual shape (an ellipse ghosts as an
   * ellipse), not a bounding rect. Falls back to a rect outline of
   * `ghostElement` when absent.
   */
  ghostElementShape?: Element;
  /**
   * Combined world-space bounding box of a multi-selection (or a
   * single group-typed shape's children union). When set the overlay
   * paints a 1-px outline and resize handles on top of the per-shape
   * selection outlines so the user can grab a group handle.
   */
  groupBounds?: Bounds;
  /**
   * Restrict the group-bounds handles to the four corners (aspect-
   * locked resize) instead of the default 8 corner+midpoint set.
   * Used by group-typed shapes which cannot be stretched
   * independently along one axis.
   */
  groupAspectLocked?: boolean;
  /**
   * Drop-zone of the container currently under the dragged shape.
   * Drawn as a dashed accent rect so the user sees where the element
   * will be nested after release.
   */
  containerDropZone?: Bounds;
  /**
   * Live brush stroke preview during a `brush`-mode drag. Drawn as a
   * variable-width fill so the user sees pressure modulation as they
   * stroke. `origin` is in world coords; `points` are local-to-origin
   * (matches the BrushElement memory layout).
   */
  brushPreview?: {
    readonly origin: Vec2;
    readonly points: readonly { x: number; y: number; width: number }[];
    readonly fill: string;
    /** Stroke opacity (0–1), matching the committed brush. Defaults to 1. */
    readonly opacity: number;
  };
  /**
   * Ephemeral laser-pointer trails. Each point carries a birth timestamp (`t`,
   * `performance.now()` domain); the overlay ramps per-segment opacity from
   * 1 → 0 over {@link LASER_TRAIL_TTL_MS} against the current time, so the trail
   * fades tail-first like a comet. Purely presentational — never in the scene.
   */
  laserStrokes?: readonly LaserStroke[];
  /**
   * Fading eraser drag trail. Same {@link LaserStroke} shape and TTL fade as
   * {@link laserStrokes}, but painted in a neutral eraser grey (not the laser
   * red) — laid while an erase stroke is dragged. Purely presentational.
   */
  eraserTrail?: readonly LaserStroke[];
  /**
   * Eraser cursor ring: `center` in WORLD space (projected to screen), `radius`
   * in SCREEN px (the panel's eraser width — NOT scaled by zoom). Painted as a
   * grey ring following the pointer while the erase tool is active, replacing
   * the hidden OS cursor. Skipped when `radius <= 0`.
   */
  eraserCursor?: { readonly center: Vec2; readonly radius: number };
  /**
   * Remote peer cursors. Each one renders as a small coloured arrow
   * with a name chip in the peer's colour, anchored at the world-
   * space position. The local cursor never appears here.
   */
  peerCursors?: readonly PeerCursor[];
  /**
   * Remote peer selections. Each entry paints a dashed outline in
   * the peer's colour around every world-space bbox in `bounds`.
   */
  peerSelections?: readonly PeerSelection[];
  /**
   * Annotation pins to render on the overlay. Each pin is a small
   * circle anchored at the annotation's world position; resolved
   * annotations get a muted colour. Highlighted pin (the one in
   * `selectedAnnotation`) gets an accent ring.
   */
  annotations?: readonly Annotation[];
  selectedAnnotation?: AnnotationId | null;
  /**
   * World bboxes of animated (GIF) shapes whose playback is paused
   * (auto-stopped or held under prefers-reduced-motion). Each draws a
   * small "play" chip so the user knows a click resumes it.
   */
  gifBadges?: readonly Bounds[];
  /**
   * In-canvas text editing chrome for the shape under edit. All rects
   * are WORLD-space; the overlay projects them to screen. `caret` is
   * `null` while blinked off. Selection rects render as a translucent
   * highlight under the caret.
   */
  editingText?: {
    readonly caret: { readonly x: number; readonly y: number; readonly height: number } | null;
    readonly caretColor: string;
    readonly selectionRects: readonly Bounds[];
  };
  /**
   * Debug: paint the mouse hit-zones (resize-handle slop, edge-
   * endpoint radius, edge-body threshold) for **every** element, so
   * the tuned values can be eyeballed. Off by default; toggled via
   * the debug panel. Drawn first, under the real selection chrome.
   */
  debugHitZones?: boolean;
  /**
   * Debug: link-attach drop-zones (anchor catchment circles + edge bands)
   * to paint while a link endpoint is being placed. Only meaningful with
   * `debugHitZones` on; supplied by the orchestrator during a link drag.
   */
  debugAttachZones?: HitZoneAttach;
  /**
   * Debug: element drop-zones (frames + containers) to paint while an
   * element is being dragged. Only meaningful with `debugHitZones` on;
   * supplied by the orchestrator during an element drag.
   */
  debugContainerZones?: HitZoneContainers;
  /**
   * Which hit-zone categories are actionable right now (from
   * `hitZoneVisibility`). Gates `drawHitZones` so it only paints the
   * targets the user can act on. Defaults to the at-rest set when omitted.
   */
  debugHitZoneVisibility?: HitZoneVisibility;
  /**
   * Read-only / view mode. When set, selection outlines (halos) still paint
   * but every interactive handle is suppressed: per-shape resize/rotate grips
   * (section 1), the combined group-bounds handles (section 7) and the
   * selected-link endpoint/bend handles (section 5). A viewer sees what's
   * selected but has no affordance to grab-and-mutate.
   */
  readOnly?: boolean;
  style?: Partial<OverlayStyle>;
}

/**
 * Shared context threaded through the per-section overlay renderers. Bundles
 * the scene/selection, the draw target, resolved style, and the precomputed
 * world→screen transform + zoom so each section stays a pure `(ctx) => void`.
 */
interface OverlayCtx {
  readonly scene: Scene;
  readonly selection: Selection;
  readonly target: RenderTarget;
  readonly options: OverlayOptions;
  readonly style: OverlayStyle;
  readonly w2s: Transform;
  readonly zoom: number;
}

/**
 * Draws selection outlines, resize handles, previews, peer chrome and other
 * affordances on the overlay layer. Pure draw — does not alter scene or state.
 * A thin dispatcher: each numbered layer lives in its own `render*` helper,
 * called here in strict back-to-front paint order.
 */
export const renderOverlay = (
  scene: Scene,
  selection: Selection,
  target: RenderTarget,
  options: OverlayOptions = {},
): void => {
  const style = { ...DEFAULT_OVERLAY_STYLE, ...options.style };
  target.clear();

  // World → screen transform: handles draw at constant screen size.
  const w2s = getWorldToScreen(scene.viewport);
  const zoom = scene.viewport.zoom;

  target.save();
  target.setTransform(matrix.IDENTITY);

  const ctx: OverlayCtx = { scene, selection, target, options, style, w2s, zoom };
  renderDebugHitZones(ctx);
  renderSelectionHandles(ctx);
  renderPreviews(ctx);
  renderLinkHandles(ctx);
  renderPeerSelections(ctx);
  renderBrushPreview(ctx);
  renderLaserTrails(ctx);
  renderEraserCursor(ctx);
  renderContainerDropZone(ctx);
  renderGroupBounds(ctx);
  renderAnnotations(ctx);
  renderPeerCursors(ctx);
  renderGifBadges(ctx);
  renderTextEditing(ctx);

  target.restore();
};

/**
 * Section 0 — debug hit-zones. Drawn first so the real selection chrome sits
 * on top. Visualises every element's mouse hit-targets.
 */
const renderDebugHitZones = (ctx: OverlayCtx): void => {
  const { scene, selection, target, options, w2s, zoom } = ctx;
  if (options.debugHitZones) {
    drawHitZones(target, {
      scene,
      w2s,
      zoom,
      selection,
      visibility:
        options.debugHitZoneVisibility ??
        hitZoneVisibility({ linkDragActive: false, elementDragActive: false }),
      ...(options.edgeSelection ? { edgeSelection: options.edgeSelection } : {}),
      ...(options.debugAttachZones ? { attach: options.debugAttachZones } : {}),
      ...(options.debugContainerZones ? { containers: options.debugContainerZones } : {}),
      ...(options.groupBounds ? { groupBounds: options.groupBounds } : {}),
      ...(options.groupAspectLocked !== undefined
        ? { groupAspectLocked: options.groupAspectLocked }
        : {}),
    });
  }
};

/**
 * Section 1 — per-shape selection outlines (+ resize/rotate handles only when a
 * single shape is selected). Multi-selection skips per-shape handles in favour
 * of the combined group bbox handles (section 7) — otherwise the overlay would
 * look like a forest of corner squares and the user could grab a child handle,
 * which `hitTest` also blocks.
 */
const renderSelectionHandles = (ctx: OverlayCtx): void => {
  const { scene, selection, target, options, style, w2s, zoom } = ctx;
  // Crop mode owns the chrome: the crop frame + handles replace the normal
  // per-shape resize/rotate affordances (drawn by renderPreviews).
  if (options.cropFrame) return;
  const multiSelect = selection.size > 1;
  for (const id of selection) {
    const shape = scene.elements.get(id);
    if (!shape) continue;
    // Groups have no intrinsic geometry — outline the union of their
    // descendants as an axis-aligned box. A single shape gets an oriented
    // frame that turns with its rotation, so the selection box hugs the body
    // instead of its (larger, axis-aligned) AABB.
    if (isGroup(shape)) {
      const worldBounds = groupWorldBounds(scene, id);
      if (!worldBounds) continue;
      const screenBounds = projectBounds(worldBounds, w2s);
      drawOutline(target, screenBounds, style);
      if (shape.locked === true) {
        drawLockBadge(target, screenBounds);
        continue;
      }
      // Read-only: outline only — no resize/rotate affordances to grab.
      if (multiSelect || !isResizable(shape) || options.readOnly === true) continue;
      for (const handle of CORNER_HANDLES) {
        const worldPoint = handlePosition(handle, worldBounds, zoom);
        drawHandle(target, matrix.applyToPoint(w2s, worldPoint), style);
      }
      drawRotateGripForBounds(target, worldBounds, zoom, w2s, style);
      continue;
    }

    const frame = shapeSelectionFrame(shape);
    // Unrotated → the plain AABB rect (unchanged rendering); rotated → a quad
    // through the frame's corners so the box turns with the shape.
    if (frame.rotation === 0) {
      drawOutline(target, projectBounds(frame.bounds, w2s), style);
    } else {
      drawFrameOutline(target, frame, w2s, style);
    }

    // Locked element: no resize handles; show a small lock badge instead so
    // the user sees why it won't move/resize (click still selects → unlock).
    if (shape.locked === true) {
      drawLockBadge(target, frameScreenBounds(frame, w2s));
      continue;
    }

    // Read-only: outline only — no resize/rotate affordances to grab.
    if (multiSelect || !isResizable(shape) || options.readOnly === true) continue;

    // Draw only the four CORNER dots — at the rotated frame corners. Edge
    // resize is done by dragging the selection-box side itself, so no midpoint
    // dot is needed; the edge handles stay hit-testable via `hitHandleOnFrame`.
    for (const handle of CORNER_HANDLES) {
      const worldPoint = handleWorldOnFrame(handle, frame, zoom);
      drawHandle(target, matrix.applyToPoint(w2s, worldPoint), style);
    }
    // Rotate grip from the shape's template anchor (default bottom-left).
    drawRotateIcon(target, matrix.applyToPoint(w2s, rotateGripWorld(shape, zoom)), style);
  }
};

/**
 * Sections 2–3.5 — the transient draw/create previews and their landing
 * highlights: the rubber-band rect, the WYSIWYG shape preview, the link
 * preview, the click-create ghost, and the float-attach target outline.
 */
const renderPreviews = (ctx: OverlayCtx): void => {
  const { target, options, style, w2s } = ctx;

  // 0. Crop-mode ghost — the faint full bitmap behind the crop chrome, so the
  //    pixels hidden by the window stay visible. Drawn first (under the frame).
  if (options.cropGhost) {
    drawCropGhost(target, options.cropGhost, w2s);
  }

  // 1. Image-crop frame: dashed accent quad + L-shaped corner brackets (the
  //    edge midpoints stay grabbable but aren't drawn, Excalidraw-style).
  if (options.cropFrame && options.cropFrame.length >= 4) {
    const cornersScreen = options.cropFrame.map((p) => matrix.applyToPoint(w2s, p));
    drawCropFrame(target, cornersScreen, style);
    drawCropCornerBrackets(target, cornersScreen, style);
  }

  // 2. Rubber-band drawing preview (already in world coords if drawn before transform reset)
  if (options.drawingPreview) {
    const screenBounds = projectBounds(options.drawingPreview, w2s);
    drawDrawingPreview(target, screenBounds, style);
  }

  // 2.5 WYSIWYG shape-draw preview — render the would-be element through
  //     its real renderer (in the world→screen transform, like renderScene)
  //     so a drag shows the actual rect / ellipse + default style, not just
  //     a dashed box. Drawn faded so it reads as "not committed yet".
  if (options.drawingPreviewElement) {
    const el = options.drawingPreviewElement;
    const renderer = getElementRenderer(el.type);
    if (renderer) {
      target.save();
      target.setTransform(w2s);
      target.setOpacity(DRAW_PREVIEW_OPACITY);
      target.setDashArray(null);
      target.translate(el.position.x, el.position.y);
      if (el.rotation !== 0) target.rotate(el.rotation);
      if (el.scale.x !== 1 || el.scale.y !== 1) target.scale(el.scale.x, el.scale.y);
      renderer(el, target);
      target.restore();
    }
  }

  // 2.6 Flowchart-create node preview — the pending nodes of a Cmd/Ctrl+Arrow
  //     grow session, each through its real renderer (faded). The connecting
  //     links are drawn by the orchestrator at the same opacity.
  if (options.flowchartPreviewElements && options.flowchartPreviewElements.length > 0) {
    for (const el of options.flowchartPreviewElements) {
      const renderer = getElementRenderer(el.type);
      if (!renderer) continue;
      target.save();
      target.setTransform(w2s);
      target.setOpacity(FLOWCHART_PREVIEW_OPACITY);
      target.setDashArray(null);
      target.translate(el.position.x, el.position.y);
      if (el.rotation !== 0) target.rotate(el.rotation);
      if (el.scale.x !== 1 || el.scale.y !== 1) target.scale(el.scale.x, el.scale.y);
      renderer(el, target);
      target.restore();
    }
  }

  // Stroke-erase live fragments — full opacity (the originals are hidden), drawn
  // per-element so the overlay's cursor / trail chrome survive underneath.
  if (options.strokeErasePreviewElements && options.strokeErasePreviewElements.length > 0) {
    for (const el of options.strokeErasePreviewElements) {
      const renderer = getElementRenderer(el.type);
      if (!renderer) continue;
      target.save();
      target.setTransform(w2s);
      target.setOpacity(1);
      target.setDashArray(null);
      target.translate(el.position.x, el.position.y);
      if (el.rotation !== 0) target.rotate(el.rotation);
      if (el.scale.x !== 1 || el.scale.y !== 1) target.scale(el.scale.x, el.scale.y);
      renderer(el, target);
      target.restore();
    }
  }

  // 3.4 Ghost preview for "click a start dot → create element". Just the
  //     would-be ELEMENT here (faded); its connector is drawn separately
  //     through the real link renderer by the orchestrator (so it matches
  //     the link that'll be created, not a dashed line).
  if (options.ghostElement || options.ghostElementShape) {
    target.setOpacity(GHOST_PREVIEW_OPACITY);
    const ghostShape = options.ghostElementShape;
    const ghostRenderer = ghostShape ? getElementRenderer(ghostShape.type) : undefined;
    if (ghostShape && ghostRenderer) {
      // Render the actual shape through its renderer (in the world→screen
      // transform, like renderScene) so the ghost matches the real element.
      target.save();
      target.setTransform(w2s);
      target.setDashArray(null); // shape is solid; don't inherit any dash state
      target.translate(ghostShape.position.x, ghostShape.position.y);
      if (ghostShape.rotation !== 0) target.rotate(ghostShape.rotation);
      if (ghostShape.scale.x !== 1 || ghostShape.scale.y !== 1) {
        target.scale(ghostShape.scale.x, ghostShape.scale.y);
      }
      ghostRenderer(ghostShape, target);
      target.restore();
    } else if (options.ghostElement) {
      const g = projectBounds(options.ghostElement, w2s);
      target.setStroke(style.selectionStroke);
      target.setStrokeWidth(1.5);
      target.setDashArray(null);
      target.setFill(null);
      target.beginPath();
      target.rect(g.x, g.y, g.width, g.height);
      target.stroke();
    }
    target.setOpacity(1);
  }

  // 3.5 Float-attach target highlight — the whole element a connector will
  //     attach to (drop on body, not a dot). Brand outline, under the dots.
  if (options.linkAttachHighlight) {
    const b = projectBounds(options.linkAttachHighlight, w2s);
    const pad = 2;
    target.setStroke(style.selectionStroke);
    target.setStrokeWidth(2);
    target.setDashArray(null);
    target.setFill(null);
    target.beginPath();
    target.rect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
    target.stroke();
  }
};

/**
 * Sections 4–5 — link chrome: port-dot attach affordances, the persistent
 * selection halo around every selected link, and the selected-edge endpoint /
 * waypoint / midpoint handles.
 */
const renderLinkHandles = (ctx: OverlayCtx): void => {
  const { target, options, style, w2s, zoom } = ctx;

  // 4. Port dots — hover affordance in draw-edge mode. May be one set or
  //    several (source start-anchors + target attach-anchors at once).
  if (options.ports) {
    const portSets: readonly PortOverlay[] = Array.isArray(options.ports)
      ? options.ports
      : [options.ports];
    for (const set of portSets) {
      for (let i = 0; i < set.worldPoints.length; i++) {
        const screen = matrix.applyToPoint(w2s, req(set.worldPoints[i]));
        const active = set.activeIndex === i;
        drawPortDot(target, screen, active, set.role, active ? set.activeRadius : undefined);
      }
    }
  }

  // 4.6 Persistent selection halo around every selected link. Same world-
  // space rounded-stroke technique as the hover halo, but with the
  // selection colour and a touch more opacity so it reads as "selected".
  if (options.selectedLinkPaths && options.selectedLinkPaths.length > 0) {
    target.setTransform(w2s);
    target.setStroke(style.selectionStroke);
    target.setOpacity(SELECTION_HALO_OPACITY);
    target.setDashArray(null);
    target.setLineJoin("round");
    target.setLineCap("round");
    // A link's stroke is centred on its path, so its visible edge is
    // `width/2` from the path. Halo width `= width + 2 × peek/zoom` →
    // `2 × (width/2 + peek/zoom)` → peeks exactly `peek` screen px beyond the
    // link's visible edge, same constant as elements.
    const peekWorld = SELECTION_HALO_PEEK_PX / (zoom || 1);
    for (const { path, width } of options.selectedLinkPaths) {
      if (path.length < 2) continue;
      target.setStrokeWidth(width + 2 * peekWorld);
      target.beginPath();
      strokeRoundedPolyline(target, path, LINK_CORNER_RADIUS);
      target.stroke();
    }
    target.setOpacity(1);
    target.setLineJoin("miter");
    target.setLineCap("butt");
    target.setTransform(matrix.IDENTITY);
  }

  // 5. Selected-edge endpoint handles + bend-point (waypoint) handles.
  //    Read-only: the halo above still marks the selected link, but the
  //    endpoint/bend grips are suppressed (nothing to re-bind or drag).
  if (options.edgeSelection && options.readOnly !== true) {
    const from = matrix.applyToPoint(w2s, options.edgeSelection.from);
    const to = matrix.applyToPoint(w2s, options.edgeSelection.to);
    // Segment-midpoint "add waypoint" handles (drawn first, under the rest).
    for (const m of options.edgeSelection.midpoints ?? []) {
      drawLinkMidpointHandle(target, matrix.applyToPoint(w2s, m), style);
    }
    drawLinkEndpointHandle(target, from, style);
    drawLinkEndpointHandle(target, to, style);
    for (const w of options.edgeSelection.waypoints ?? []) {
      drawLinkEndpointHandle(target, matrix.applyToPoint(w2s, w), style);
    }
  }
};

/**
 * Section 6 — peer selection halos. Dashed outline around shapes selected by
 * remote users, painted in their colour. Drawn before own-selection outlines
 * so own selection stays on top.
 */
const renderPeerSelections = (ctx: OverlayCtx): void => {
  const { target, options, w2s } = ctx;
  if (options.peerSelections) {
    for (const peer of options.peerSelections) {
      for (const wb of peer.bounds) {
        const sb = projectBounds(wb, w2s);
        drawPeerSelection(target, sb, peer.color);
      }
    }
  }
};

/**
 * Section 6.5 — live brush stroke preview. Quad-strip with interpolated
 * widths, same render path as the committed BrushElement. Runs in world coords
 * so the stroke stays anchored to the cursor as the user zooms / pans mid-stroke.
 */
const renderBrushPreview = (ctx: OverlayCtx): void => {
  const { target, options, w2s } = ctx;

  // 6.5. Live brush stroke preview — quad-strip with interpolated
  //      widths, same render path as the committed BrushElement. Runs
  //      in world coords so the stroke stays anchored to the cursor
  //      as the user zooms / pans mid-stroke.
  if (options.brushPreview && options.brushPreview.points.length > 0) {
    const bp = options.brushPreview;
    target.save();
    target.setTransform(w2s);
    target.setOpacity(bp.opacity);
    target.setFill(bp.fill);
    target.setStroke(null);
    const pts = bp.points;
    const ox = bp.origin.x;
    const oy = bp.origin.y;
    if (pts.length === 1) {
      const p = req(pts[0]);
      target.beginPath();
      target.ellipse(ox + p.x, oy + p.y, p.width, p.width);
      target.fill();
    } else {
      // Same single-outline fill as the committed stroke (see `brushOutline` /
      // `drawBrush`), so the preview matches the result and honours `opacity`
      // without the per-segment double-blend at joins.
      const outline = brushOutline(pts);
      if (outline.length >= 3) {
        target.beginPath();
        const first = req(outline[0]);
        target.moveTo(ox + first.x, oy + first.y);
        for (let i = 1; i < outline.length; i++) {
          const p = req(outline[i]);
          target.lineTo(ox + p.x, oy + p.y);
        }
        target.closePath();
        target.fill();
      }
    }
    target.restore();
  }
};

/**
 * Section 6.6 — laser-pointer trails. Each segment is stroked in screen space
 * (constant on-screen width at any zoom) with an opacity that decays from the
 * newer endpoint's age: fresh points are opaque, older ones fade out, so a
 * released stroke melts away tail-first. Read-only — never mutates state.
 */
const renderLaserTrails = (ctx: OverlayCtx): void => {
  const { target, options, w2s } = ctx;
  drawFadingTrail(target, w2s, options.laserStrokes, LASER_COLOR, LASER_WIDTH, LASER_TRAIL_TTL_MS);
  // Eraser drag trail — identical fade mechanics, neutral grey (not laser red).
  // Its width matches the cursor ring's DIAMETER (2 × the panel radius) so the
  // wake is exactly as wide as the eraser; a much shorter TTL than the laser
  // keeps it a tight wake, not a long comet.
  const eraserWidth = (options.eraserCursor?.radius ?? LASER_WIDTH / 2) * 2;
  drawFadingTrail(
    target,
    w2s,
    options.eraserTrail,
    ERASER_CURSOR_STROKE,
    eraserWidth,
    ERASER_TRAIL_TTL_MS,
  );
};

/**
 * Paint a trail (shared by the laser pointer and the eraser wake) the way
 * Excalidraw does: ONE filled outline per stroke, not a stack of alpha-blended
 * segments. The smoothed centreline is offset by a half-width that tapers from
 * `width/2` at the head to 0 at the tail, giving a single comet shape with a
 * pointed tail — no overlapping round caps beading at the joints. The whole
 * stroke fills at one opacity that ramps down by the NEWEST point's age over
 * `ttl` ms, so after release the comet dissolves as its tail is pruned. Drawn in
 * screen space (constant on-screen width at any zoom). Read-only.
 */
const drawFadingTrail = (
  target: RenderTarget,
  w2s: Transform,
  strokes: readonly LaserStroke[] | undefined,
  color: string,
  width: number,
  ttl: number,
): void => {
  if (!strokes || strokes.length === 0) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const maxHalf = width / 2;
  target.setStroke(null);
  target.setDashArray(null);
  target.setFill(color);
  for (const stroke of strokes) {
    const pts = smoothLaserPoints(stroke.points);
    if (pts.length === 0) continue;
    // One opacity for the whole shape (Excalidraw fills a single path once);
    // ramps by the freshest point's age so a released stroke fades as a whole.
    const newest = req(pts[pts.length - 1]);
    const op = 1 - (now - newest.t) / ttl;
    if (op <= 0) continue;
    target.setOpacity(op);
    const screen = pts.map((p) => matrix.applyToPoint(w2s, { x: p.x, y: p.y }));
    if (screen.length === 1) {
      const s = req(screen[0]);
      target.beginPath();
      target.ellipse(s.x, s.y, maxHalf, maxHalf);
      target.fill();
      continue;
    }
    const outline = taperedTrailOutline(screen, maxHalf);
    const first = req(outline[0]);
    target.beginPath();
    target.moveTo(first.x, first.y);
    for (let i = 1; i < outline.length; i++) {
      const p = req(outline[i]);
      target.lineTo(p.x, p.y);
    }
    target.closePath();
    target.fill();
  }
  target.setOpacity(1);
};

/**
 * Build the closed outline polygon of a variable-width ribbon around the screen
 * polyline `pts` (tail → head order). Each vertex is offset by ±`hw` along the
 * local normal, where the half-width tapers linearly from 0 at the tail (index
 * 0) to `maxHalf` at the head (last index). Returns the left side forward then
 * the right side backward — one closed loop to fill in a single pass.
 */
export const taperedTrailOutline = (pts: readonly Vec2[], maxHalf: number): Vec2[] => {
  const n = pts.length;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p = req(pts[i]);
    const prev = req(pts[Math.max(0, i - 1)]);
    const next = req(pts[Math.min(n - 1, i + 1)]);
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    // Normal (perpendicular) × the tapered half-width.
    const hw = maxHalf * (n > 1 ? i / (n - 1) : 1);
    const nx = -ty * hw;
    const ny = tx * hw;
    left.push({ x: p.x + nx, y: p.y + ny });
    right.push({ x: p.x - nx, y: p.y - ny });
  }
  right.reverse();
  return [...left, ...right];
};

/**
 * Section 6.7 — eraser cursor ring. A grey circle following the pointer while
 * the erase tool is active, its radius the panel's eraser width in SCREEN px
 * (so it matches the slider number, unscaled by zoom). Replaces the hidden OS
 * cursor. Read-only — never mutates state.
 */
const renderEraserCursor = (ctx: OverlayCtx): void => {
  const { target, options, w2s } = ctx;
  const cursor = options.eraserCursor;
  if (!cursor || cursor.radius <= 0) return;
  const s = matrix.applyToPoint(w2s, cursor.center);
  target.setDashArray(null);
  target.setOpacity(1);
  target.beginPath();
  target.ellipse(s.x, s.y, cursor.radius, cursor.radius);
  // Solid disc in the trail colour (fully opaque), with the ring on top for a
  // crisp radius edge.
  target.setFill(ERASER_CURSOR_STROKE);
  target.fill();
  target.setFill(null);
  target.setStroke(ERASER_CURSOR_STROKE);
  target.setStrokeWidth(ERASER_CURSOR_LINE_WIDTH);
  target.stroke();
};

/**
 * Section 7.0 — container drop-zone highlight. Drawn under selection chrome so
 * handles stay legible. Dashed rect + soft fill — same visual language as the
 * drawing preview.
 */
const renderContainerDropZone = (ctx: OverlayCtx): void => {
  const { target, options, w2s } = ctx;
  if (options.containerDropZone) {
    const zoneScreen = projectBounds(options.containerDropZone, w2s);
    target.setFill("rgba(26, 115, 232, 0.10)");
    target.setStroke("#1a73e8");
    target.setStrokeWidth(2);
    target.setDashArray([6, 3]);
    target.beginPath();
    target.rect(zoneScreen.x, zoneScreen.y, zoneScreen.width, zoneScreen.height);
    target.fill();
    target.stroke();
    target.setDashArray(null);
  }
};

/**
 * Section 7 — multi-selection / group-typed combined bounds: outline + handles.
 * Only CORNER dots are drawn (edge resize = drag the box side); the edge
 * handles stay hit-testable via `hitHandle` for non-aspect-locked groups.
 */
const renderGroupBounds = (ctx: OverlayCtx): void => {
  const { target, options, style, w2s, zoom } = ctx;
  // Crop mode owns the chrome: an image is aspect-locked, so its selection
  // reports `groupBounds` — but its resize/rotate handles must not show on top
  // of the crop brackets. Suppress them exactly like the per-shape handles.
  if (options.cropFrame) return;
  if (options.groupBounds) {
    const groupScreen = projectBounds(options.groupBounds, w2s);
    drawOutline(target, groupScreen, style);
    // Read-only: combined-bounds outline only — no resize/rotate handles.
    if (options.readOnly === true) return;
    const handleSet = CORNER_HANDLES;
    for (const handle of handleSet) {
      const worldPoint = handlePosition(handle, options.groupBounds, zoom);
      const screenPoint = matrix.applyToPoint(w2s, worldPoint);
      drawHandle(target, screenPoint, style);
    }
    drawRotateGripForBounds(target, options.groupBounds, zoom, w2s, style);
  }
};

/**
 * Section 7.5 — annotation pins. Drawn before peer cursors so cursors stay on
 * top, but on top of selection handles. Each pin shows a comment-count badge
 * when the thread has > 0 replies.
 */
const renderAnnotations = (ctx: OverlayCtx): void => {
  const { scene, target, options, w2s } = ctx;
  if (options.annotations && options.annotations.length > 0) {
    for (const ann of options.annotations) {
      const world = getAnnotationWorldPosition(scene, ann);
      const screen = matrix.applyToPoint(w2s, world);
      drawAnnotationPin(target, screen, ann, options.selectedAnnotation ?? null);
    }
  }
};

/**
 * Section 8 — remote peer cursors. Drawn near-last so they sit on top of every
 * other overlay element (including own selection handles).
 */
const renderPeerCursors = (ctx: OverlayCtx): void => {
  const { target, options, w2s } = ctx;
  if (options.peerCursors) {
    for (const cursor of options.peerCursors) {
      const screen = matrix.applyToPoint(w2s, cursor.position);
      drawPeerCursor(target, screen, cursor.color, cursor.name);
    }
  }
};

/**
 * Section 9 — GIF "play" badges on paused animated shapes. Drawn late so they
 * sit above selection chrome.
 */
const renderGifBadges = (ctx: OverlayCtx): void => {
  const { target, options, w2s } = ctx;
  if (options.gifBadges) {
    for (const b of options.gifBadges) {
      drawGifBadge(target, projectBounds(b, w2s));
    }
  }
};

/**
 * Section 10 — in-canvas text editing: translucent selection highlight, then
 * the caret bar on top. Both backends draw this via the shared RenderTarget
 * primitives (rect + fill), so it's identical on Canvas2D and WebGL2.
 */
const renderTextEditing = (ctx: OverlayCtx): void => {
  const { target, options, w2s, zoom } = ctx;
  if (options.editingText) {
    const et = options.editingText;
    if (et.selectionRects.length > 0) {
      target.setFill(TEXT_SELECTION_FILL);
      target.setOpacity(TEXT_SELECTION_OPACITY);
      for (const r of et.selectionRects) {
        const s = projectBounds(r, w2s);
        target.beginPath();
        target.rect(s.x, s.y, s.width, s.height);
        target.fill();
      }
      target.setOpacity(1);
    }
    if (et.caret) {
      const p = matrix.applyToPoint(w2s, { x: et.caret.x, y: et.caret.y });
      target.setFill(et.caretColor);
      target.setOpacity(1);
      target.beginPath();
      target.rect(p.x, p.y, TEXT_CARET_WIDTH_PX, et.caret.height * zoom);
      target.fill();
    }
  }
};

const drawLockBadge = (target: RenderTarget, b: Bounds): void => {
  const s = LOCK_BADGE_SIZE;
  const x = b.x + b.width - s - 2;
  const y = b.y + 2;
  const color = LOCK_BADGE_COLOR;
  // Shackle — a ring above the body; its lower half is hidden by the body so
  // the visible top arc reads as the lock's bow.
  target.setStroke(color);
  target.setFill(null);
  target.setStrokeWidth(2);
  target.setDashArray(null);
  target.setOpacity(1);
  target.beginPath();
  target.ellipse(x + s / 2, y + s * 0.46, s * 0.22, s * 0.26);
  target.stroke();
  // Body — solid rounded block.
  target.setStroke(null);
  target.setFill(color);
  target.beginPath();
  target.rect(x + s * 0.2, y + s * 0.44, s * 0.6, s * 0.48);
  target.fill();
  // Keyhole.
  target.setFill(LOCK_BADGE_KEYHOLE_COLOR);
  target.beginPath();
  target.ellipse(x + s / 2, y + s * 0.64, s * 0.07, s * 0.07);
  target.fill();
};

const drawGifBadge = (target: RenderTarget, screen: Bounds): void => {
  const x = screen.x + GIF_BADGE_PAD;
  const y = screen.y + GIF_BADGE_PAD;
  const w = GIF_BADGE_W;
  const h = GIF_BADGE_H;
  const r = GIF_BADGE_RADIUS;
  // Rounded-rect background.
  target.setStroke(null);
  target.setFill(GIF_BADGE_BG_COLOR);
  target.beginPath();
  target.moveTo(x + r, y);
  target.lineTo(x + w - r, y);
  target.quadraticCurveTo(x + w, y, x + w, y + r);
  target.lineTo(x + w, y + h - r);
  target.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  target.lineTo(x + r, y + h);
  target.quadraticCurveTo(x, y + h, x, y + h - r);
  target.lineTo(x, y + r);
  target.quadraticCurveTo(x, y, x + r, y);
  target.closePath();
  target.fill();
  // "gif" label.
  target.setFill("#ffffff");
  target.setFont("system-ui, sans-serif", 10);
  target.setTextAlign("center");
  target.setTextBaseline("middle");
  target.fillText("gif", x + w / 2, y + h / 2);
};

const projectBounds = (b: Bounds, w2s: Transform): Bounds => {
  const tl = matrix.applyToPoint(w2s, { x: b.x, y: b.y });
  const br = matrix.applyToPoint(w2s, { x: b.x + b.width, y: b.y + b.height });
  const x = Math.min(tl.x, br.x);
  const y = Math.min(tl.y, br.y);
  return { x, y, width: Math.abs(br.x - tl.x), height: Math.abs(br.y - tl.y) };
};

const drawOutline = (target: RenderTarget, b: Bounds, style: OverlayStyle): void => {
  target.setStroke(style.selectionStroke);
  target.setStrokeWidth(style.selectionStrokeWidth);
  target.setDashArray(null);
  target.beginPath();
  target.rect(b.x, b.y, b.width, b.height);
  target.stroke();
};

/** Selection outline as a (possibly rotated) quad through the frame's corners. */
const drawFrameOutline = (
  target: RenderTarget,
  frame: SelectionFrame,
  w2s: Transform,
  style: OverlayStyle,
): void => {
  const [wnw, wne, wse, wsw] = frameCorners(frame);
  const nw = matrix.applyToPoint(w2s, wnw);
  const ne = matrix.applyToPoint(w2s, wne);
  const se = matrix.applyToPoint(w2s, wse);
  const sw = matrix.applyToPoint(w2s, wsw);
  target.setStroke(style.selectionStroke);
  target.setStrokeWidth(style.selectionStrokeWidth);
  target.setDashArray(null);
  target.beginPath();
  target.moveTo(nw.x, nw.y);
  target.lineTo(ne.x, ne.y);
  target.lineTo(se.x, se.y);
  target.lineTo(sw.x, sw.y);
  target.closePath();
  target.stroke();
};

/** Screen-space AABB enclosing the frame's (rotated) corners — for badges. */
const frameScreenBounds = (frame: SelectionFrame, w2s: Transform): Bounds => {
  const pts = frameCorners(frame).map((c) => matrix.applyToPoint(w2s, c));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

/** Fill/stroke recipe for a filled, stroked circular handle dot. */
interface HandleDotStyle {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  /** When set, the dot is painted at this opacity and reset to 1 afterwards. */
  readonly opacity?: number;
}

/**
 * Shared draw for every "filled circle with an outline" handle affordance —
 * resize handles, port dots, link endpoint / waypoint / midpoint grabs. A
 * circle reads as "draggable handle" more clearly than a sharp rectangle, and
 * `ellipse` is supported by every RenderTarget (canvas, svg). State-setter
 * order is irrelevant to output; only the state at `fill()`/`stroke()` matters.
 */
const drawHandleDot = (
  target: RenderTarget,
  center: Vec2,
  radius: number,
  s: HandleDotStyle,
): void => {
  if (s.opacity !== undefined) target.setOpacity(s.opacity);
  target.setStroke(s.stroke);
  target.setStrokeWidth(s.strokeWidth);
  target.setDashArray(null);
  target.setFill(s.fill);
  target.beginPath();
  target.ellipse(center.x, center.y, radius, radius);
  target.fill();
  target.stroke();
  if (s.opacity !== undefined) target.setOpacity(1);
};

const drawHandle = (target: RenderTarget, center: Vec2, style: OverlayStyle): void => {
  drawHandleDot(target, center, HANDLE_SIZE, {
    fill: style.handleFill,
    stroke: style.handleStroke,
    strokeWidth: 1,
  });
};

/**
 * Rotate grip: a clockwise circular-arrow glyph (the `rotate-cw` icon) centred
 * at `grip` (screen px), with no connector line back to the shape. Authored in
 * lucide's 24×24 space — a near-full circle (radius 9) opening on the right plus
 * an `L`-shaped arrowhead at the opening — scaled so the circle radius is
 * `ROTATE_ICON_RADIUS` screen px.
 */
const drawRotateIcon = (target: RenderTarget, grip: Vec2, style: OverlayStyle): void => {
  const s = ROTATE_ICON_RADIUS / 9; // icon radius 9 (in its 24×24 box) → screen px
  // Map a point from the icon's 24×24 space (centre 12,12) to screen.
  const tx = (px: number, py: number): Vec2 => ({
    x: grip.x + (px - 12) * s,
    y: grip.y + (py - 12) * s,
  });
  target.setStroke(style.handleStroke);
  target.setFill(null);
  target.setStrokeWidth(2 * s); // lucide strokeWidth 2
  target.setLineCap("round");
  target.setLineJoin("round");
  target.setDashArray(null);
  // Arc: centre (12,12), radius 9, from 0° (east tail) clockwise to (21,8)
  // (≈ 336° swept) — a polyline is smooth enough at this size.
  const END_DEG = 336;
  const STEPS = 30;
  target.beginPath();
  for (let i = 0; i <= STEPS; i++) {
    const a = ((END_DEG * i) / STEPS) * (Math.PI / 180);
    const p = tx(12 + 9 * Math.cos(a), 12 + 9 * Math.sin(a));
    if (i === 0) target.moveTo(p.x, p.y);
    else target.lineTo(p.x, p.y);
  }
  target.stroke();
  // Arrowhead at the arc's end (lucide `M21 3 v5 h-5`): a right-angle chevron.
  const a1 = tx(21, 3);
  const a2 = tx(21, 8);
  const a3 = tx(16, 8);
  target.beginPath();
  target.moveTo(a1.x, a1.y);
  target.lineTo(a2.x, a2.y);
  target.lineTo(a3.x, a3.y);
  target.stroke();
  target.setLineCap("butt");
  target.setLineJoin("miter");
};

/** Project the rotate grip to screen and draw the icon for AABB `b`. */
const drawRotateGripForBounds = (
  target: RenderTarget,
  b: Bounds,
  zoom: number,
  w2s: Transform,
  style: OverlayStyle,
): void => {
  const grip = rotateGripForBounds(b, zoom);
  drawRotateIcon(target, matrix.applyToPoint(w2s, grip), style);
};

const drawDrawingPreview = (target: RenderTarget, b: Bounds, style: OverlayStyle): void => {
  target.setStroke(style.drawingStroke);
  target.setStrokeWidth(1);
  target.setDashArray(style.drawingDash);
  target.beginPath();
  target.rect(b.x, b.y, b.width, b.height);
  target.stroke();
};

/**
 * Dashed accent quad for the image-crop window. `pts` are already in screen
 * space (4 corners, clockwise). The grab handles are drawn separately (all 8
 * corner + edge nubs) by the caller.
 */
const drawCropFrame = (target: RenderTarget, pts: readonly Vec2[], style: OverlayStyle): void => {
  target.setStroke(style.selectionStroke);
  target.setStrokeWidth(1.5);
  target.setDashArray(style.drawingDash);
  target.beginPath();
  const first = req(pts[0]);
  target.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const p = req(pts[i]);
    target.lineTo(p.x, p.y);
  }
  target.lineTo(first.x, first.y);
  target.stroke();
  target.setDashArray(null);
};

/**
 * L-shaped corner brackets on the crop frame (Excalidraw-style), replacing the
 * round resize-nubs. `corners` are the 4 window corners in SCREEN space,
 * clockwise (nw, ne, se, sw); each bracket's two arms run along the adjacent
 * edges, so the marks stay aligned when the image is rotated. Only the corners
 * are drawn — the edge midpoints remain grabbable via hit-testing.
 */
const drawCropCornerBrackets = (
  target: RenderTarget,
  corners: readonly Vec2[],
  style: OverlayStyle,
): void => {
  if (corners.length < 4) return;
  target.setStroke(style.selectionStroke);
  target.setStrokeWidth(CROP_BRACKET_WIDTH);
  target.setDashArray(null);
  target.setLineCap("round");
  target.setLineJoin("round");
  const armTo = (from: Vec2, to: Vec2): Vec2 => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const t = Math.min(CROP_BRACKET_LEN, len) / len;
    return { x: from.x + dx * t, y: from.y + dy * t };
  };
  for (let i = 0; i < 4; i++) {
    const c = req(corners[i]);
    const prev = req(corners[(i + 3) % 4]);
    const next = req(corners[(i + 1) % 4]);
    const a = armTo(c, prev);
    const b = armTo(c, next);
    target.beginPath();
    target.moveTo(a.x, a.y);
    target.lineTo(c.x, c.y);
    target.lineTo(b.x, b.y);
    target.stroke();
  }
  target.setLineCap("butt");
  target.setLineJoin("miter");
};

/**
 * Paint the faint full-image ghost behind the crop chrome. Replicates the main
 * image renderer's transform path: apply the element's local→world transform,
 * then draw the whole bitmap over the virtual full-image LOCAL rect at
 * {@link CROP_GHOST_OPACITY}. Resolves the live handle exactly as the built-in
 * image renderer (`metadata.image`, else `resolveImageSource`); skips silently
 * when no handle is available (async decode in flight / headless).
 */
const drawCropGhost = (
  target: RenderTarget,
  ghost: { readonly element: Element; readonly fullRect: Bounds },
  w2s: Transform,
): void => {
  const el = ghost.element as ImageElement;
  const handle =
    el.animationKind !== undefined
      ? resolveImageSource(el, undefined)
      : (el.metadata?.image ?? resolveImageSource(el, undefined));
  if (handle === null || handle === undefined) return;
  const dynamic = el.metadata?.animated === true || el.animationKind !== undefined;
  const { fullRect } = ghost;
  target.save();
  target.setTransform(w2s);
  target.setDashArray(null);
  target.translate(el.position.x, el.position.y);
  if (el.rotation !== 0) target.rotate(el.rotation);
  if (el.scale.x !== 1 || el.scale.y !== 1) target.scale(el.scale.x, el.scale.y);
  target.setOpacity(CROP_GHOST_OPACITY);
  target.drawImage(handle, fullRect.x, fullRect.y, fullRect.width, fullRect.height, dynamic);
  target.setOpacity(1);
  target.restore();
};

const drawPortDot = (
  target: RenderTarget,
  center: Vec2,
  active: boolean,
  role: "link-start" | "link-attach" = "link-start",
  activeRadius?: number,
): void => {
  const radius = active ? (activeRadius ?? ANCHOR_DOT_ACTIVE_RADIUS) : ANCHOR_DOT_RADIUS;
  const isStart = role === "link-start";

  // When active (snapped), use the inverse fill of the resting state
  // to highlight the dot.
  const fill = active
    ? isStart
      ? LINK_START_ANCHOR_STROKE
      : LINK_ATTACH_ANCHOR_STROKE
    : isStart
      ? LINK_START_ANCHOR_FILL
      : LINK_ATTACH_ANCHOR_FILL;
  const stroke = isStart ? LINK_START_ANCHOR_STROKE : LINK_ATTACH_ANCHOR_STROKE;

  drawHandleDot(target, center, radius, { fill, stroke, strokeWidth: ANCHOR_DOT_STROKE_WIDTH });
};

const drawLinkEndpointHandle = (target: RenderTarget, center: Vec2, style: OverlayStyle): void => {
  drawHandleDot(target, center, LINK_ENDPOINT_HANDLE_DRAW_RADIUS, {
    fill: style.handleFill,
    stroke: style.selectionStroke,
    strokeWidth: 2,
  });
};

// Smaller, semi-transparent dot on a segment midpoint — the "drag to add a
// bend point" affordance. Lighter than a real waypoint handle so it reads
// as secondary.
const drawLinkMidpointHandle = (target: RenderTarget, center: Vec2, style: OverlayStyle): void => {
  drawHandleDot(target, center, LINK_MIDPOINT_HANDLE_DRAW_RADIUS, {
    fill: style.handleFill,
    stroke: style.selectionStroke,
    strokeWidth: 1.5,
    opacity: 0.55,
  });
};

const drawPeerSelection = (target: RenderTarget, b: Bounds, color: string): void => {
  const pad = PEER_SELECTION_PADDING;
  target.setStroke(color);
  target.setStrokeWidth(PEER_SELECTION_STROKE_WIDTH);
  target.setDashArray(PEER_SELECTION_DASH);
  target.beginPath();
  target.rect(b.x - pad, b.y - pad, b.width + 2 * pad, b.height + 2 * pad);
  target.stroke();
};

const drawPeerCursor = (target: RenderTarget, tip: Vec2, color: string, name: string): void => {
  // Arrow glyph — a triangle anchored at the cursor tip. Coordinates
  // are relative to the tip; the canonical macOS pointer leans down-
  // right.
  const size = CURSOR_ARROW_SIZE;
  target.setFill(color);
  target.setStroke("#fff");
  target.setStrokeWidth(1);
  target.setDashArray(null);
  target.beginPath();
  target.moveTo(tip.x, tip.y);
  target.lineTo(tip.x + size * 0.7, tip.y + size * 0.25);
  target.lineTo(tip.x + size * 0.35, tip.y + size * 0.4);
  target.lineTo(tip.x + size * 0.5, tip.y + size * 0.95);
  target.lineTo(tip.x + size * 0.35, tip.y + size * 1.05);
  target.lineTo(tip.x + size * 0.2, tip.y + size * 0.5);
  target.lineTo(tip.x, tip.y + size * 0.65);
  target.closePath();
  target.fill();
  target.stroke();

  // Name chip — anchored down-right of the tip.
  target.setFont("sans-serif", CURSOR_NAME_FONT_SIZE);
  target.setTextBaseline("top");
  target.setTextAlign("left");
  const textWidth = target.measureText(name).width;
  const chipX = tip.x + CURSOR_NAME_CHIP_OFFSET;
  const chipY = tip.y + CURSOR_NAME_CHIP_OFFSET;
  const chipW = textWidth + 2 * CURSOR_NAME_CHIP_PADDING_X;
  const chipH = CURSOR_NAME_FONT_SIZE + 2 * CURSOR_NAME_CHIP_PADDING_Y;
  target.setFill(color);
  target.setStrokeWidth(0);
  target.beginPath();
  target.rect(chipX, chipY, chipW, chipH);
  target.fill();
  target.setFill("#fff");
  target.fillText(name, chipX + CURSOR_NAME_CHIP_PADDING_X, chipY + CURSOR_NAME_CHIP_PADDING_Y);
};

const drawAnnotationPin = (
  target: RenderTarget,
  center: Vec2,
  annotation: Annotation,
  selectedId: AnnotationId | null,
): void => {
  const radius = ANNOTATION_PIN_RADIUS;
  const fill = annotation.resolved ? ANNOTATION_PIN_RESOLVED_FILL : ANNOTATION_PIN_FILL;
  const selected = annotation.id === selectedId;

  // Circle body.
  target.setFill(fill);
  target.setStroke(selected ? "#1a73e8" : ANNOTATION_PIN_STROKE);
  target.setStrokeWidth(selected ? 2 : 1.5);
  target.setDashArray(null);
  target.beginPath();
  target.ellipse(center.x, center.y, radius, radius);
  target.fill();
  target.stroke();

  // Comment-count badge (when thread length > 1; the first comment is the
  // body of the pin itself).
  if (annotation.thread.length > 0) {
    const count = annotation.thread.length;
    const label = count > 9 ? "9+" : String(count);
    target.setFont("sans-serif", ANNOTATION_PIN_BADGE_FONT_SIZE);
    target.setTextAlign("center");
    target.setTextBaseline("middle");
    target.setFill("#fff");
    target.fillText(label, center.x, center.y);
  }
};
