import type { AnnotationId, Bounds, ShapeId, Transform, Vec2 } from "@oh-just-another/types";
import {
  getAnnotationWorldPosition,
  getShapeWorldBounds,
  getWorldToScreen,
  type Annotation,
  type Scene,
  type ShapeBase,
} from "@oh-just-another/scene";
import { bounds as B, matrix } from "@oh-just-another/math";
import type { RenderTarget } from "@oh-just-another/renderer-core";
import {
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
  EDGE_ENDPOINT_HANDLE_DRAW_RADIUS,
  PEER_SELECTION_DASH,
  PEER_SELECTION_PADDING,
  PEER_SELECTION_STROKE_WIDTH,
  PORT_DOT_ACTIVE_RADIUS,
  PORT_DOT_RADIUS,
} from "./constants.js";
import { ALL_HANDLES, CORNER_HANDLES, HANDLE_SIZE, handlePosition } from "./handle.js";
import type { Selection } from "./selection.js";

/**
 * Shape types the editor can resize via the 8 corner/edge handles. Other
 * shapes (polygon, path, text — they have free-form geometry) get only a
 * selection outline.
 */
const RESIZABLE_TYPES: ReadonlySet<string> = new Set(["rectangle", "ellipse", "image", "template"]);

export const isResizable = (shape: ShapeBase): boolean => RESIZABLE_TYPES.has(shape.type);

/**
 * Union AABB of every direct child of `groupId` (recursive). Returns
 * `null` for empty groups so callers can skip the outline pass. Used
 * by the selection overlay to draw a halo around grouped shapes.
 */
const groupWorldBounds = (scene: Scene, groupId: ShapeId): Bounds | null => {
  let acc: Bounds | null = null;
  for (const shape of scene.shapes.values()) {
    if (shape.parentId !== groupId) continue;
    const inner = shape.type === "group" ? groupWorldBounds(scene, shape.id) : getShapeWorldBounds(shape);
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

/**
 * Draws selection outlines, resize handles, and the rubber-band rectangle on
 * the overlay layer. Pure draw — does not alter scene or state.
 *
 * Handles are sized in *screen* pixels regardless of zoom (4 × 4 CSS px) — the
 * caller passes the viewport so this function can compensate.
 */
export interface EdgePreview {
  /** World-space anchor on the source shape, or null for a free point. */
  readonly from: Vec2;
  readonly to: Vec2;
}

/**
 * Set of world-space points to render as port dots — used when the editor
 * wants to show "you can attach here" affordances on a hovered shape in
 * draw-edge mode.
 */
export interface PortOverlay {
  readonly worldPoints: readonly Vec2[];
  /** Highlight one of the points (the snap target). Optional. */
  readonly activeIndex?: number;
}

/**
 * Selected edge with endpoint world positions. Renderer paints small
 * handles on each end so the user can grab and re-bind them.
 */
export interface EdgeSelection {
  readonly from: Vec2;
  readonly to: Vec2;
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
 * peer's `selection: ShapeId[]` and the current scene shapes.
 */
export interface PeerSelection {
  readonly color: string;
  readonly bounds: readonly Bounds[];
}

export const renderOverlay = (
  scene: Scene,
  selection: Selection,
  target: RenderTarget,
  options: {
    drawingPreview?: Bounds;
    edgePreview?: EdgePreview;
    ports?: PortOverlay;
    edgeSelection?: EdgeSelection;
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
     * (matches the BrushShape memory layout).
     */
    brushPreview?: {
      readonly origin: { readonly x: number; readonly y: number };
      readonly points: readonly { x: number; y: number; width: number }[];
      readonly fill: string;
    };
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
    style?: Partial<OverlayStyle>;
  } = {},
): void => {
  const style = { ...DEFAULT_OVERLAY_STYLE, ...options.style };
  target.clear();

  // World → screen transform: handles draw at constant screen size.
  const w2s = getWorldToScreen(scene.viewport);
  const zoom = scene.viewport.zoom;

  target.save();
  target.setTransform(matrix.IDENTITY);

  // 1. Selection outlines (+ handles only when a single shape is
  //    selected). Multi-selection skips per-shape handles in favour of
  //    the combined group bbox handles drawn later — otherwise the
  //    overlay would look like a forest of corner squares and the user
  //    could grab a child handle, which `hitTest` also blocks.
  const multiSelect = selection.size > 1;
  for (const id of selection) {
    const shape = scene.shapes.get(id);
    if (!shape) continue;
    // Groups have no intrinsic geometry — outline the union of their
    // descendants instead. Otherwise the selection chrome would collapse
    // to a zero-size point at the group's origin.
    const worldBounds =
      shape.type === "group" ? groupWorldBounds(scene, id) : getShapeWorldBounds(shape);
    if (!worldBounds) continue;
    const screenBounds = projectBounds(worldBounds, w2s);

    drawOutline(target, screenBounds, style);

    if (multiSelect || !isResizable(shape)) continue;

    for (const handle of ALL_HANDLES) {
      const worldPoint = handlePosition(handle, worldBounds, zoom);
      const screenPoint = matrix.applyToPoint(w2s, worldPoint);
      drawHandle(target, screenPoint, style);
    }
  }

  // 2. Rubber-band drawing preview (already in world coords if drawn before transform reset)
  if (options.drawingPreview) {
    const screenBounds = projectBounds(options.drawingPreview, w2s);
    drawDrawingPreview(target, screenBounds, style);
  }

  // 3. Edge-drawing preview — straight dashed line in screen space.
  if (options.edgePreview) {
    const from = matrix.applyToPoint(w2s, options.edgePreview.from);
    const to = matrix.applyToPoint(w2s, options.edgePreview.to);
    drawEdgePreview(target, from, to, style);
  }

  // 4. Port dots — hover affordance in draw-edge mode.
  if (options.ports && options.ports.worldPoints.length > 0) {
    for (let i = 0; i < options.ports.worldPoints.length; i++) {
      const screen = matrix.applyToPoint(w2s, options.ports.worldPoints[i]!);
      const active = options.ports.activeIndex === i;
      drawPortDot(target, screen, style, active);
    }
  }

  // 5. Selected-edge endpoint handles.
  if (options.edgeSelection) {
    const from = matrix.applyToPoint(w2s, options.edgeSelection.from);
    const to = matrix.applyToPoint(w2s, options.edgeSelection.to);
    drawEdgeEndpointHandle(target, from, style);
    drawEdgeEndpointHandle(target, to, style);
  }

  // 6. Peer selection halos — dashed outline around shapes selected
  // by remote users, painted in their colour. Drawn before own-
  // selection outlines so own selection stays on top.
  if (options.peerSelections) {
    for (const peer of options.peerSelections) {
      for (const wb of peer.bounds) {
        const sb = projectBounds(wb, w2s);
        drawPeerSelection(target, sb, peer.color);
      }
    }
  }

  // 6.5. Live brush stroke preview — quad-strip with interpolated
  //      widths, same render path as the committed BrushShape. Runs
  //      in world coords so the stroke stays anchored to the cursor
  //      as the user zooms / pans mid-stroke.
  if (options.brushPreview && options.brushPreview.points.length > 0) {
    const bp = options.brushPreview;
    target.save();
    target.setTransform(w2s);
    target.setFill(bp.fill);
    target.setStroke(null);
    const pts = bp.points;
    const ox = bp.origin.x;
    const oy = bp.origin.y;
    if (pts.length === 1) {
      const p = pts[0]!;
      target.beginPath();
      target.ellipse(ox + p.x, oy + p.y, p.width, p.width);
      target.fill();
    } else {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        const ax = ox + a.x;
        const ay = oy + a.y;
        const bx = ox + b.x;
        const by = oy + b.y;
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        target.beginPath();
        target.moveTo(ax + nx * a.width, ay + ny * a.width);
        target.lineTo(bx + nx * b.width, by + ny * b.width);
        target.lineTo(bx - nx * b.width, by - ny * b.width);
        target.lineTo(ax - nx * a.width, ay - ny * a.width);
        target.closePath();
        target.fill();
        target.beginPath();
        target.ellipse(bx, by, b.width, b.width);
        target.fill();
      }
    }
    target.restore();
  }

  // 7.0. Container drop-zone highlight — drawn under selection chrome
  //      so handles stay legible. Dashed rect + soft fill — same
  //      visual language as the drawing preview.
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

  // 7. Multi-selection / group-typed combined bounds — outline + handles.
  //    Aspect-locked groups: corner handles only; otherwise full 8.
  if (options.groupBounds) {
    const groupScreen = projectBounds(options.groupBounds, w2s);
    drawOutline(target, groupScreen, style);
    const handleSet = options.groupAspectLocked ? CORNER_HANDLES : ALL_HANDLES;
    for (const handle of handleSet) {
      const worldPoint = handlePosition(handle, options.groupBounds, zoom);
      const screenPoint = matrix.applyToPoint(w2s, worldPoint);
      drawHandle(target, screenPoint, style);
    }
  }

  // 7.5. Annotation pins — drawn before peer cursors so cursors stay
  // on top, but on top of selection handles. Each pin shows a comment
  // count badge when the thread has > 0 replies.
  if (options.annotations && options.annotations.length > 0) {
    for (const ann of options.annotations) {
      const world = getAnnotationWorldPosition(scene, ann);
      const screen = matrix.applyToPoint(w2s, world);
      drawAnnotationPin(target, screen, ann, options.selectedAnnotation ?? null);
    }
  }

  // 8. Remote peer cursors — drawn last so they sit on top of every
  // other overlay element (including own selection handles).
  if (options.peerCursors) {
    for (const cursor of options.peerCursors) {
      const screen = matrix.applyToPoint(w2s, cursor.position);
      drawPeerCursor(target, screen, cursor.color, cursor.name);
    }
  }

  // 9. GIF "play" badges on paused animated shapes — drawn last
  //    so they sit above selection chrome.
  if (options.gifBadges) {
    for (const b of options.gifBadges) {
      drawGifBadge(target, projectBounds(b, w2s));
    }
  }

  target.restore();
};

/** Rounded "gif" chip in a shape's top-left corner — signals a paused
 *  GIF the user can click (or hover) to resume. */
const GIF_BADGE_W = 30;
const GIF_BADGE_H = 16;
const GIF_BADGE_PAD = 4;
const GIF_BADGE_RADIUS = 4;

const drawGifBadge = (target: RenderTarget, screen: Bounds): void => {
  const x = screen.x + GIF_BADGE_PAD;
  const y = screen.y + GIF_BADGE_PAD;
  const w = GIF_BADGE_W;
  const h = GIF_BADGE_H;
  const r = GIF_BADGE_RADIUS;
  // Rounded-rect background.
  target.setStroke(null);
  target.setFill("rgba(0,0,0,0.65)");
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

const drawHandle = (target: RenderTarget, center: Vec2, style: OverlayStyle): void => {
  // Circle of radius HANDLE_SIZE — visually equivalent to a rounded
  // square with maximum corner radius, but renders via `ellipse`
  // which every RenderTarget already supports (canvas, svg). A rounded
  // shape reads as "draggable handle" more clearly than a sharp rectangle.
  target.setFill(style.handleFill);
  target.setStroke(style.handleStroke);
  target.setStrokeWidth(1);
  target.setDashArray(null);
  target.beginPath();
  target.ellipse(center.x, center.y, HANDLE_SIZE, HANDLE_SIZE);
  target.fill();
  target.stroke();
};

const drawDrawingPreview = (target: RenderTarget, b: Bounds, style: OverlayStyle): void => {
  target.setStroke(style.drawingStroke);
  target.setStrokeWidth(1);
  target.setDashArray(style.drawingDash);
  target.beginPath();
  target.rect(b.x, b.y, b.width, b.height);
  target.stroke();
};

const drawEdgePreview = (target: RenderTarget, from: Vec2, to: Vec2, style: OverlayStyle): void => {
  target.setStroke(style.drawingStroke);
  target.setStrokeWidth(1.5);
  target.setDashArray(style.drawingDash);
  target.beginPath();
  target.moveTo(from.x, from.y);
  target.lineTo(to.x, to.y);
  target.stroke();
};

const drawPortDot = (
  target: RenderTarget,
  center: Vec2,
  style: OverlayStyle,
  active: boolean,
): void => {
  const radius = active ? PORT_DOT_ACTIVE_RADIUS : PORT_DOT_RADIUS;
  target.setStroke(style.selectionStroke);
  target.setStrokeWidth(active ? 2 : 1);
  target.setDashArray(null);
  target.setFill(active ? style.selectionStroke : style.handleFill);
  target.beginPath();
  target.ellipse(center.x, center.y, radius, radius);
  target.fill();
  target.stroke();
};

const drawEdgeEndpointHandle = (target: RenderTarget, center: Vec2, style: OverlayStyle): void => {
  const radius = EDGE_ENDPOINT_HANDLE_DRAW_RADIUS;
  target.setStroke(style.selectionStroke);
  target.setStrokeWidth(2);
  target.setDashArray(null);
  target.setFill(style.handleFill);
  target.beginPath();
  target.ellipse(center.x, center.y, radius, radius);
  target.fill();
  target.stroke();
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
