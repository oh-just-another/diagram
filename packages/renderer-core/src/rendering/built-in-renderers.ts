import { polygon as polygonMath } from "@oh-just-another/math";
import {
  getCornerRadius,
  getElementLocalBounds,
  registerRenderOverflow,
  FRAME_HEADER_HEIGHT,
  FRAME_HEADER_PADDING_X,
  FRAME_HEADER_FONT_SIZE,
  type BlockArrowElement,
  type ElementBase,
  type EmojiElement,
  type StickyElement,
  type BrushElement,
  type EllipseElement,
  type FrameElement,
  type GroupElement,
  type ImageElement,
  type ImageMask,
  type PathElement,
  type PolygonElement,
  type RectangleElement,
  type Style,
  type TextElement,
  type TextRun,
  type TextStyle,
  sliceRuns,
  listMarkers,
  paragraphCount,
  brushBodyColor,
  brushOutline,
  pickTextPlaceholder,
} from "@oh-just-another/scene";
import { registerElementRenderer, type ElementRenderer } from "./shape-renderer.js";
import type { RenderTarget } from "../targets/render-target.js";
import { isTextBelowLod, type LodOptions } from "./lod.js";
import {
  DEFAULT_LINE_HEIGHT_FACTOR,
  layoutText,
  lineLeft,
  type EditableTextLayout,
} from "../text/text-editing.js";
import { resolveImageSource } from "../raster/animation-adapter.js";
import { isDrawableImageSource } from "../raster/image-source-guard.js";
import {
  LABEL_PADDING_EM,
  LABEL_AUTOFIT_MIN_PX,
  LABEL_AUTOFIT_MAX_PX,
  STICKY_DEFAULT_FILL,
  STICKY_CORNER_RADIUS,
  STICKY_AUTHOR_FONT_SIZE,
  STICKY_AUTHOR_COLOR,
  STICKY_SHADOW_COLOR,
  STICKY_SHADOW_OFFSET_Y,
  STICKY_TAG_FONT_SIZE,
  STICKY_TAG_PAD_X,
  STICKY_TAG_HEIGHT,
  STICKY_TAG_GAP,
  STICKY_TAG_BG,
  STICKY_TAG_COLOR,
  STICKY_REACTION_FONT_SIZE,
  STICKY_REACTION_HEIGHT,
  STICKY_REACTION_PAD_X,
  STICKY_REACTION_GAP,
  STICKY_REACTION_BG,
  STICKY_REACTION_ADD_COLOR,
  STICKY_REACTION_MIN_SCREEN_PX,
  STICKY_REACTION_COLOR,
  LIST_MARKER_GAP_EM,
  TEXT_DECORATION_THICKNESS,
  TEXT_UNDERLINE_OFFSET,
  TEXT_STRIKETHROUGH_OFFSET,
  ARROWHEAD_HEAD_RATIO,
  ARROWHEAD_BODY_THICKNESS,
  ARROWHEAD_RATIO_MIN,
  ARROWHEAD_RATIO_MAX,
  FRAME_STROKE_COLOR,
  FRAME_FILL_COLOR,
  FRAME_HEADER_BG_COLOR,
  FRAME_HEADER_TEXT_COLOR,
  TEXT_PLACEHOLDER_COLOR,
} from "../constants.js";
import { req, type Vec2 } from "@oh-just-another/types";

/**
 * Applies common style fields to a target. Returns whether any fill or stroke
 * was configured — shape renderers use the result to decide which paint call
 * to issue.
 */
const applyStyle = (style: Style, target: RenderTarget): { fill: boolean; stroke: boolean } => {
  const hasFill = style.fill !== undefined && style.fill !== "transparent";
  const hasStroke =
    style.stroke !== undefined && style.stroke !== "transparent" && (style.strokeWidth ?? 1) > 0;

  if (hasFill) target.setFill(style.fill);
  if (hasStroke) {
    target.setStroke(style.stroke);
    target.setStrokeWidth(style.strokeWidth ?? 1);
    if (style.lineCap) target.setLineCap(style.lineCap);
    if (style.lineJoin) target.setLineJoin(style.lineJoin);
    if (style.dashArray) target.setDashArray(style.dashArray);
  }
  if (style.opacity !== undefined) target.setOpacity(style.opacity);

  return { fill: hasFill, stroke: hasStroke };
};

const drawRectangle: ElementRenderer<RectangleElement> = (shape, target) => {
  const { fill, stroke } = applyStyle(shape.style, target);
  if (!fill && !stroke) return;
  const r = getCornerRadius(shape.style.roundness, shape.width, shape.height);
  // Fill path — always uses the original shape geometry.
  if (fill) {
    target.beginPath();
    if (r > 0) {
      buildRoundedRectPath(target, 0, 0, shape.width, shape.height, r);
    } else {
      target.rect(0, 0, shape.width, shape.height);
    }
    target.fill();
  }
  // Stroke path — offset by `strokeAlign` so the stroke sits inside
  // / centred-on / outside the fill region. The default (omitted /
  // `center`) reuses the fill geometry. Implemented at this layer so
  // every backend (Canvas2D, WebGL2, SVG) honours strokeAlign without
  // backend-specific work — the math is purely on the rect bounds.
  if (stroke) {
    const offset = strokeAlignOffset(shape.style);
    const sx = offset;
    const sy = offset;
    const sw = shape.width - 2 * offset;
    const sh = shape.height - 2 * offset;
    if (sw <= 0 || sh <= 0) return; // degenerate offset — skip
    const sr = r > 0 ? Math.max(0, r - offset) : 0;
    target.beginPath();
    if (sr > 0) {
      buildRoundedRectPath(target, sx, sy, sw, sh, sr);
    } else {
      target.rect(sx, sy, sw, sh);
    }
    target.stroke();
  }
};

/**
 * Translate `Style.strokeAlign` into a path-offset distance in world
 * units. The rendered stroke geometry shifts by `±half-width` along
 * the inward / outward normal:
 *   center  → 0 (path centred — Canvas2D / SVG default).
 *   inside  → +half-width (path moves inward so the stroke's outer
 *             edge sits on the original fill boundary).
 *   outside → -half-width (path moves outward so the stroke's inner
 *             edge sits on the boundary).
 *
 * Only used by axis-aligned primitives (rectangle, container) where
 * "inward" reduces to "subtract from bbox".
 */
const strokeAlignOffset = (style: Style): number => {
  const align = style.strokeAlign ?? "center";
  if (align === "center") return 0;
  const half = (style.strokeWidth ?? 1) / 2;
  return align === "inside" ? half : -half;
};

/**
 * Build a rounded-rect path via the standard "4 corners with
 * quadratic Bezier arcs" pattern — same shape every backend
 * understands without a special `roundRect()` API:
 *
 *     ┌───arc───┐
 *     │         │
 *     arc      arc
 *     │         │
 *     └───arc───┘
 *
 * Quadratic control points sit at each corner of the rect; the
 * curve goes from `r` units along one side to `r` units along the
 * adjacent side.
 *
 * Radius `r` is pre-clamped by `getCornerRadius` to half the
 * smaller side, so no overlap-handling is needed here.
 */
export const buildRoundedRectPath = (
  target: RenderTarget,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void => {
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
};

const drawEllipse: ElementRenderer<EllipseElement> = (shape, target) => {
  const { fill, stroke } = applyStyle(shape.style, target);
  if (!fill && !stroke) return;
  const rx = shape.width / 2;
  const ry = shape.height / 2;
  if (fill) {
    target.beginPath();
    target.ellipse(rx, ry, rx, ry);
    target.fill();
  }
  if (stroke) {
    // Inset / outset radii by `strokeAlignOffset` so the stroke
    // sits inside / centred-on / outside the fill ellipse. Centre
    // stays the same; radii shift uniformly. Degenerate (radius ≤ 0)
    // skips the pass.
    const offset = strokeAlignOffset(shape.style);
    const srx = rx - offset;
    const sry = ry - offset;
    if (srx <= 0 || sry <= 0) return;
    target.beginPath();
    target.ellipse(rx, ry, srx, sry);
    target.stroke();
  }
};

const drawPolygon: ElementRenderer<PolygonElement> = (shape, target) => {
  if (shape.points.length < 2) return;
  const { fill, stroke } = applyStyle(shape.style, target);
  if (!fill && !stroke) return;
  if (fill) {
    target.beginPath();
    polygonPath(target, shape.points);
    target.fill();
  }
  if (stroke) {
    const offset = strokeAlignOffset(shape.style);
    const pts = offset !== 0 ? polygonMath.offsetClosedPath(shape.points, offset) : shape.points;
    target.beginPath();
    polygonPath(target, pts);
    target.stroke();
  }
};

/** Emit a closed polygon outline as `moveTo` + `lineTo`s + `closePath`. */
const polygonPath = (target: RenderTarget, pts: readonly Vec2[]): void => {
  const first = pts[0];
  if (first === undefined) return;
  target.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p === undefined) continue;
    target.lineTo(p.x, p.y);
  }
  target.closePath();
};

const drawPath: ElementRenderer<PathElement> = (shape, target) => {
  if (shape.commands.length === 0) return;
  const { fill, stroke } = applyStyle(shape.style, target);
  if (!fill && !stroke) return;
  target.beginPath();
  for (const cmd of shape.commands) {
    switch (cmd.kind) {
      case "M":
        target.moveTo(cmd.to.x, cmd.to.y);
        break;
      case "L":
        target.lineTo(cmd.to.x, cmd.to.y);
        break;
      case "Q":
        target.quadraticCurveTo(cmd.control.x, cmd.control.y, cmd.to.x, cmd.to.y);
        break;
      case "C":
        target.bezierCurveTo(
          cmd.control1.x,
          cmd.control1.y,
          cmd.control2.x,
          cmd.control2.y,
          cmd.to.x,
          cmd.to.y,
        );
        break;
      case "Z":
        target.closePath();
        break;
    }
  }
  if (fill) target.fill();
  if (stroke) target.stroke();
};

/**
 * Rich-text path: draw a text element whose glyphs carry per-run styling
 * (bold / italic / colour / decoration). Each visual line is split into
 * style segments (via `sliceRuns` against the line's source offsets) and each
 * segment is painted with its own font + fill at an accumulated x offset —
 * so it renders identically on Canvas2D, WebGL2 and SVG through the shared
 * `RenderTarget`. Line breaking uses the ELEMENT's base font metrics (matches
 * the plain-text path); per-run weight only affects glyph paint + segment
 * widths, an acceptable etap-1 approximation for wrapping.
 */
/**
 * Sticky note: a rounded card filled with `style.fill` (default sticky
 * yellow); the text itself is the shared embedded label, drawn by the
 * scene renderer's label pass. The author name renders along the bottom
 * edge when `showAuthor` is set.
 */
/**
 * The zoom at which `shape`'s shorter side spans exactly
 * `STICKY_REACTION_MIN_SCREEN_PX` on screen — the reaction chrome's
 * visibility threshold for that sticky.
 */
const stickyReactionMinZoom = (shape: StickyElement): number =>
  STICKY_REACTION_MIN_SCREEN_PX / Math.max(1, Math.min(shape.width, shape.height));

/**
 * Whether `shape` is large enough on screen at `zoom` for its reaction
 * chrome (pills and the "+" button) to be drawn and clickable.
 */
export const stickyReactionChromeVisible = (shape: StickyElement, zoom: number): boolean =>
  Math.min(shape.width, shape.height) * zoom >= STICKY_REACTION_MIN_SCREEN_PX;

/**
 * The pill scale factor keeping reaction chrome at a CONSTANT on-screen
 * size: world size = base / zoom, with the divisor clamped at the sticky's
 * visibility threshold so a zoomed-out board gets shrinking (not
 * card-swallowing) pills.
 */
const stickyReactionScale = (shape: StickyElement, zoom: number): number =>
  1 / Math.max(zoom > 0 ? zoom : 1, stickyReactionMinZoom(shape));

interface StickyReactionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface StickyReactionPill extends StickyReactionRect {
  readonly glyph: string;
  readonly label: string;
}

/**
 * Layout of a sticky's reaction pills + the "+" add button under its
 * bottom edge, in the shape's LOCAL space. Pills flow left-to-right and
 * WRAP onto new rows (inline-block style) when they'd overrun the card
 * width — every reaction is always laid out, none are dropped. ONE
 * implementation shared by the canvas renderer and the DOM click-zone
 * overlay so the hit areas always match the painted pills.
 *
 * `measure` must be bound to `STICKY_REACTION_FONT_SIZE`-sized system-ui
 * text (base px); `zoom` is the current view scale — pill sizes are
 * divided by it so they stay visually constant (clamped at the sticky's
 * {@link stickyReactionChromeVisible} threshold).
 */
export const stickyReactionLayout = (
  shape: StickyElement,
  measure: (s: string) => number,
  zoom = 1,
): { readonly pills: readonly StickyReactionPill[]; readonly add: StickyReactionRect } => {
  const k = stickyReactionScale(shape, zoom);
  const gap = STICKY_REACTION_GAP * k;
  const h = STICKY_REACTION_HEIGHT * k;
  const x0 = STICKY_CORNER_RADIUS + 2;
  const pills: StickyReactionPill[] = [];
  let x = x0;
  let y = shape.height + gap;
  for (const reaction of shape.reactions ?? []) {
    const users = (reaction as { users?: readonly string[]; count?: number }).users;
    const count = users?.length ?? (reaction as { count?: number }).count ?? 0;
    const label = `${reaction.glyph} ${String(count)}`;
    const width = (measure(label) + 2 * STICKY_REACTION_PAD_X) * k;
    if (x > x0 && x + width > shape.width) {
      x = x0;
      y += h + gap;
    }
    pills.push({ glyph: reaction.glyph, label, x, y, width, height: h });
    x += width + gap;
  }
  if (x > x0 && x + h > shape.width) {
    x = x0;
    y += h + gap;
  }
  return { pills, add: { x, y, width: h, height: h } };
};

/** Pills half of {@link stickyReactionLayout} (click-zone overlay helper). */
export const stickyReactionPillRects = (
  shape: StickyElement,
  measure: (s: string) => number,
  zoom = 1,
): readonly StickyReactionPill[] => stickyReactionLayout(shape, measure, zoom).pills;

/** "+" button half of {@link stickyReactionLayout} (click-zone overlay helper). */
export const stickyReactionAddRect = (
  shape: StickyElement,
  measure: (s: string) => number,
  zoom = 1,
): StickyReactionRect => stickyReactionLayout(shape, measure, zoom).add;

const drawSticky: ElementRenderer<StickyElement> = (shape, target, ctx) => {
  const fill = shape.style.fill ?? STICKY_DEFAULT_FILL;
  if (shape.style.opacity !== undefined) target.setOpacity(shape.style.opacity);
  const w = shape.width;
  const h = shape.height;
  const r = STICKY_CORNER_RADIUS;

  // Soft drop shadow under the card, offset downwards.
  target.setFill(STICKY_SHADOW_COLOR);
  target.beginPath();
  buildRoundedRectPath(target, 1, STICKY_SHADOW_OFFSET_Y, w - 2, h - 2, r);
  target.fill();

  // The card body — a plain rounded sheet over its drop shadow.
  target.setFill(fill);
  target.beginPath();
  buildRoundedRectPath(target, 0, 0, w, h, r);
  target.fill();

  // Tag pills along the bottom edge.
  if (ctx?.content?.stickyTags !== false && shape.tags !== undefined && shape.tags.length > 0) {
    target.setFont("system-ui, sans-serif", STICKY_TAG_FONT_SIZE, {});
    target.setTextAlign("left");
    target.setTextBaseline("top");
    let x = r + 2;
    const y = h - STICKY_TAG_HEIGHT - 3;
    for (const tag of shape.tags) {
      const tw = target.measureText(tag).width + 2 * STICKY_TAG_PAD_X;
      if (x + tw > w - r) break;
      target.setFill(STICKY_TAG_BG);
      target.beginPath();
      buildRoundedRectPath(target, x, y, tw, STICKY_TAG_HEIGHT, STICKY_TAG_HEIGHT / 2);
      target.fill();
      target.setFill(STICKY_TAG_COLOR);
      target.fillText(
        tag,
        x + STICKY_TAG_PAD_X,
        y + (STICKY_TAG_HEIGHT - STICKY_TAG_FONT_SIZE) / 2,
      );
      x += tw + STICKY_TAG_GAP;
    }
  }

  if (
    ctx?.content?.stickyAuthor !== false &&
    shape.showAuthor === true &&
    shape.authorName !== undefined &&
    shape.authorName !== ""
  ) {
    target.setFont("system-ui, sans-serif", STICKY_AUTHOR_FONT_SIZE, {});
    target.setTextAlign("left");
    target.setTextBaseline("top");
    target.setFill(STICKY_AUTHOR_COLOR);
    const authorY =
      shape.tags !== undefined && shape.tags.length > 0
        ? h - STICKY_TAG_HEIGHT - STICKY_AUTHOR_FONT_SIZE - 8
        : h - STICKY_AUTHOR_FONT_SIZE - 4;
    target.fillText(shape.authorName, r + 2, authorY);
  }

  // Reaction pills under the bottom-left edge — canvas is the single
  // visual source (exports included); the DOM overlay only overlays
  // transparent click zones on the same rects.
  const zoom = ctx?.zoom ?? 1;
  const k = stickyReactionScale(shape, zoom);
  // Once the card is small on screen the whole reaction chrome is hidden —
  // constant on-screen pills would swallow it.
  const chromeVisible = stickyReactionChromeVisible(shape, zoom);
  const drawReactions = chromeVisible && ctx?.content?.stickyReactions !== false;
  // "+" add-reaction button — UI chrome drawn on the canvas so it tracks
  // the shape 1:1 while dragging. Shown only for the HOVERED sticky in
  // interactive renders; exports and read-only views switch it off.
  const drawAdd =
    chromeVisible && ctx?.content?.stickyAddButton !== false && ctx?.hoveredElement === shape.id;
  if (drawReactions || drawAdd) {
    // Measure at the BASE font size (the layout contract). Text is also
    // DRAWN at the base size inside a `scale(k)` transform: a fractional
    // per-frame font size would defeat the backend's string-bitmap cache
    // during smooth zoom (a fresh rasterisation per pill per frame).
    target.setFont("system-ui, sans-serif", STICKY_REACTION_FONT_SIZE, {});
    target.setTextAlign("left");
    target.setTextBaseline("top");
    const layout = stickyReactionLayout(shape, (t) => target.measureText(t).width, zoom);
    if (drawReactions) {
      for (const pill of layout.pills) {
        target.setFill(STICKY_REACTION_BG);
        target.beginPath();
        buildRoundedRectPath(target, pill.x, pill.y, pill.width, pill.height, pill.height / 2);
        target.fill();
        target.setFill(STICKY_REACTION_COLOR);
        target.save();
        target.translate(pill.x, pill.y);
        target.scale(k, k);
        target.fillText(
          pill.label,
          STICKY_REACTION_PAD_X,
          (STICKY_REACTION_HEIGHT - STICKY_REACTION_FONT_SIZE) / 2,
        );
        target.restore();
      }
    }
    if (drawAdd) {
      const add = layout.add;
      target.setFill(STICKY_REACTION_BG);
      target.beginPath();
      buildRoundedRectPath(target, add.x, add.y, add.width, add.height, add.height / 2);
      target.fill();
      // Vector "+" cross as two filled bars — crisper than a glyph at any
      // zoom, and immune to per-backend multi-subpath stroke quirks.
      const cx = add.x + add.width / 2;
      const cy = add.y + add.height / 2;
      const arm = add.height * 0.22;
      const bar = 1.4 * k;
      target.setFill(STICKY_REACTION_ADD_COLOR);
      target.beginPath();
      target.rect(cx - arm, cy - bar / 2, arm * 2, bar);
      target.fill();
      target.beginPath();
      target.rect(cx - bar / 2, cy - arm, bar, arm * 2);
      target.fill();
    }
  }
};

/** Emoji element: one glyph filling the element's square via the text path. */
const drawEmoji: ElementRenderer<EmojiElement> = (shape, target) => {
  if (shape.style.opacity !== undefined) target.setOpacity(shape.style.opacity);
  target.setFont("system-ui, sans-serif", shape.size, {});
  target.setTextAlign("left");
  target.setTextBaseline("top");
  target.setFill(shape.style.fill ?? "#000");
  target.fillText(shape.glyph, 0, 0);
};

/**
 * Geometry of an embedded shape label: the synthetic text element the
 * text renderer can draw, plus the local-space offset where it starts.
 * Shared by the renderer and the inline-edit caret path (state) so the
 * glyphs and the caret can't drift apart.
 */
/**
 * Auto-fit font sizing for `ShapeLabel.autoFit` (sticky notes): the
 * largest size in [`LABEL_AUTOFIT_MIN_PX`, `LABEL_AUTOFIT_MAX_PX`]
 * whose wrapped layout fits the padded shape body, found by binary
 * search over `layoutText`. Memoized — the measure callback varies by
 * backend, so the cache key folds in a coarse measure fingerprint.
 */
const autoFitCache = new Map<string, number>();

const autoFitFontSize = (
  text: string,
  boxW: number,
  boxH: number,
  measure: (s: string) => number,
  baseSize: number,
  paragraphs: TextElement["paragraphs"],
): number => {
  // The measure callback is bound to `baseSize`; normalise so the cache
  // key (and the search) are stable across backends and base sizes.
  const fingerprint = Math.round((measure("Mg водоём") / baseSize) * 1000);
  const key = `${text}|${String(Math.round(boxW))}x${String(Math.round(boxH))}|${String(fingerprint)}`;
  const cached = autoFitCache.get(key);
  if (cached !== undefined) return cached;

  const fits = (size: number): boolean => {
    const pad = LABEL_PADDING_EM * size;
    const maxWidth = boxW - 2 * pad;
    if (maxWidth < size) return false;
    // Rescale the base-size measurement to the candidate size so the
    // wrap decisions inside layoutText are internally consistent.
    const scaled = (t: string): number => (measure(t) * size) / baseSize;
    const layout = layoutText(text, scaled, {
      fontSize: size,
      maxWidth,
      ...(paragraphs !== undefined ? { paragraphs } : {}),
    });
    return layout.lines.length * layout.lineHeight <= boxH - 2 * pad;
  };
  let lo = LABEL_AUTOFIT_MIN_PX;
  let hi = LABEL_AUTOFIT_MAX_PX;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  if (autoFitCache.size > 512) autoFitCache.clear();
  autoFitCache.set(key, lo);
  return lo;
};

export const shapeLabelLayout = (
  shape: ElementBase,
  measure: (s: string) => number,
): {
  readonly synthetic: TextElement;
  readonly offsetX: number;
  readonly offsetY: number;
  /** Visible window in layout-space Y (lines outside are not painted). */
  readonly windowTop: number;
  readonly windowBottom: number;
} | null => {
  const label = shape.label;
  if (label === undefined) return null;
  const bounds = getElementLocalBounds(shape);
  const fontSize =
    label.autoFit === true && label.text !== ""
      ? autoFitFontSize(
          label.text,
          bounds.width,
          bounds.height,
          measure,
          label.fontSize,
          label.paragraphs,
        )
      : label.fontSize;
  const pad = LABEL_PADDING_EM * fontSize;
  const maxWidth = Math.max(fontSize, bounds.width - 2 * pad);
  // `measure` arrives bound to the label's BASE font size; when auto-fit
  // picked a different size, rescale so wrap decisions match the glyphs
  // that will actually be drawn.
  const scaledMeasure =
    fontSize === label.fontSize
      ? measure
      : (t: string): number => (measure(t) * fontSize) / label.fontSize;
  // Block-level vertical alignment is applied via `offsetY` below; the
  // synthetic's glyph baseline stays "top" so drawn glyphs, the caret and
  // selection rects all share top-anchored line coordinates.
  const valign = label.style?.textBaseline ?? "middle";
  const style: TextStyle = {
    textAlign: "center",
    ...label.style,
    textBaseline: "top",
  };
  const layout = layoutText(label.text, scaledMeasure, {
    fontSize,
    maxWidth,
    ...(label.paragraphs !== undefined ? { paragraphs: label.paragraphs } : {}),
  });
  // Text never escapes the shape body: only the lines inside the padded
  // window are painted (the flat text keeps the rest for editing). While
  // the inline editor is open the transient `metadata.labelScrollLines`
  // scrolls that window so the caret stays visible.
  const innerHeight = Math.max(0, bounds.height - 2 * pad);
  const clipLines = Math.max(0, Math.floor(innerHeight / layout.lineHeight));
  const rawScroll = shape.metadata?.labelScrollLines;
  const maxScroll = Math.max(0, layout.lines.length - clipLines);
  const scroll = Math.max(
    0,
    Math.min(maxScroll, typeof rawScroll === "number" ? Math.floor(rawScroll) : 0),
  );
  const synthetic = {
    id: shape.id,
    layerId: shape.layerId,
    type: "text",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: shape.order,
    style,
    text: label.text,
    fontFamily: label.fontFamily,
    fontSize,
    maxWidth,
    clipStart: scroll,
    clipLines,
    ...(label.runs !== undefined ? { runs: label.runs } : {}),
    ...(label.paragraphs !== undefined ? { paragraphs: label.paragraphs } : {}),
  } as TextElement;
  const textH = Math.min(layout.lines.length - scroll, clipLines) * layout.lineHeight;
  const windowAnchor =
    valign === "top"
      ? bounds.y + pad
      : valign === "bottom"
        ? bounds.y + bounds.height - textH - pad
        : bounds.y + Math.max(pad, (bounds.height - textH) / 2);
  // Lines keep their absolute layout Y (line × lineHeight); shifting the
  // whole block up by the scroll puts the visible window at the anchor.
  const offsetY = windowAnchor - scroll * layout.lineHeight;
  return {
    synthetic,
    offsetX: bounds.x + pad,
    offsetY,
    windowTop: scroll * layout.lineHeight,
    windowBottom: (scroll + clipLines) * layout.lineHeight,
  };
};

/**
 * Draw a shape's embedded label inside its local bounds. Reuses the text
 * renderer wholesale (wrap, runs, lists, highlight); vertical alignment
 * places the whole block, `textAlign` centres lines within the padded
 * width. Called by the scene renderer after the shape body.
 */
export const drawShapeLabel = (
  shape: ElementBase,
  target: RenderTarget,
  /** Readable-text LOD: skip the label when its resolved font size is below the floor on screen. */
  lod?: { readonly zoom: number; readonly lod: LodOptions },
): void => {
  const label = shape.label;
  if (label === undefined || label.text === "") return;
  // Fast path on the base size: an auto-fit label can only grow from it.
  if (lod && !label.autoFit && isTextBelowLod(label.fontSize, lod.zoom, lod.lod)) return;
  // Measure with the label's base font — same metrics drawText wraps with.
  const weight = label.style?.fontWeight;
  const fontStyle = label.style?.fontStyle;
  target.setFont(label.fontFamily, label.fontSize, {
    ...(weight ? { weight } : {}),
    ...(fontStyle ? { style: fontStyle } : {}),
  });
  const placed = shapeLabelLayout(shape, (s) => target.measureText(s).width);
  if (!placed) return;
  if (lod && isTextBelowLod(placed.synthetic.fontSize, lod.zoom, lod.lod)) return;
  target.save();
  target.translate(placed.offsetX, placed.offsetY);
  drawText(placed.synthetic, target);
  target.restore();
};

/**
 * Internal draw hint carried by label synthetics: paint at most this many
 * visual lines so the text never escapes the shape body. Never serialized.
 */
const clipWindowOf = (
  shape: TextElement,
): { readonly start: number; readonly end: number } | undefined => {
  const hint = shape as { readonly clipStart?: number; readonly clipLines?: number };
  if (hint.clipLines === undefined) return undefined;
  const start = hint.clipStart ?? 0;
  return { start, end: start + hint.clipLines };
};

/**
 * Draw the derived list markers ("•" / "1.") for every paragraph's first
 * visual line, right-aligned into the indent slot the layout reserved.
 * Uses the element's base font + fill; leaves the fill set to `color`.
 */
const drawListMarkersForLayout = (
  shape: TextElement,
  layout: EditableTextLayout,
  target: RenderTarget,
  color: string,
): void => {
  if (shape.paragraphs === undefined) return;
  const align = shape.style.textAlign ?? "left";
  const markers = listMarkers(shape.paragraphs, paragraphCount(shape.text));
  const gap = LIST_MARKER_GAP_EM * shape.fontSize;
  target.setFill(color);
  const markerClip = clipWindowOf(shape);
  layout.lines.forEach((line, i) => {
    if (markerClip !== undefined && (i < markerClip.start || i >= markerClip.end)) return;
    if (!line.paraFirst) return;
    const marker = markers[line.para];
    if (marker == null) return;
    const w = target.measureText(marker).width;
    const left = lineLeft(line, layout.blockWidth, align);
    target.fillText(marker, left - gap - w, i * layout.lineHeight);
  });
};

const drawStyledText = (shape: TextElement, target: RenderTarget): void => {
  const align = shape.style.textAlign ?? "left";
  const fontSize = shape.fontSize;
  target.setTextAlign("left");
  target.setTextBaseline(shape.style.textBaseline ?? "top");

  // Apply the resolved font for a run: run overlay wins, element style is
  // the fallback for any field the run omits.
  const setSegFont = (st: TextRun["style"]): void => {
    const weight = st?.fontWeight ?? shape.style.fontWeight;
    const style = st?.fontStyle ?? shape.style.fontStyle;
    target.setFont(shape.fontFamily, fontSize, {
      ...(weight ? { weight } : {}),
      ...(style ? { style } : {}),
    });
  };

  // Base-font line breaking — same metrics the plain path wraps with.
  setSegFont(undefined);
  const layout = layoutText(shape.text, (s) => target.measureText(s).width, {
    fontSize,
    ...(shape.maxWidth !== undefined ? { maxWidth: shape.maxWidth } : {}),
    ...(shape.paragraphs !== undefined ? { paragraphs: shape.paragraphs } : {}),
  });

  interface Seg {
    readonly text: string;
    readonly style: TextStyle | undefined;
    readonly width: number;
  }
  const perLine = layout.lines.map((line) => {
    const segs: Seg[] = sliceRuns(shape, line.start, line.end).map((r) => {
      setSegFont(r.style);
      return { text: r.text, style: r.style, width: target.measureText(r.text).width };
    });
    const total = segs.reduce((a, s) => a + s.width, 0);
    return { segs, total };
  });

  // Alignment box: fixed budget, or the widest STYLED line so bold text
  // stays self-consistently aligned.
  const blockWidth =
    shape.maxWidth ??
    perLine.reduce((m, l, i) => Math.max(m, l.total + req(layout.lines[i]).indentX), 0);
  const thickness = Math.max(1, fontSize * TEXT_DECORATION_THICKNESS);

  const styledClip = clipWindowOf(shape);
  perLine.forEach((line, i) => {
    if (styledClip !== undefined && (i < styledClip.start || i >= styledClip.end)) return;
    const top = i * layout.lineHeight;
    const indentX = req(layout.lines[i]).indentX;
    let x =
      indentX +
      (align === "center"
        ? (blockWidth - indentX) / 2 - line.total / 2
        : align === "right"
          ? blockWidth - indentX - line.total
          : 0);
    for (const seg of line.segs) {
      const color = seg.style?.fill ?? shape.style.fill ?? "#000";
      const opacity = seg.style?.opacity ?? shape.style.opacity;
      setSegFont(seg.style);
      if (opacity !== undefined) target.setOpacity(opacity);
      // Highlight first — a full line-height rect under the glyphs, so the
      // text paints on top of its own marker stripe.
      const highlight = seg.style?.highlight ?? shape.style.highlight;
      if (seg.width > 0 && highlight !== undefined && highlight !== "transparent") {
        target.setFill(highlight);
        target.beginPath();
        target.rect(x, top, seg.width, layout.lineHeight);
        target.fill();
      }
      target.setFill(color);
      target.fillText(seg.text, x, top);

      const deco = seg.style?.textDecoration ?? shape.style.textDecoration;
      if (seg.width > 0 && (deco?.underline || deco?.strikethrough)) {
        if (deco.underline) {
          target.beginPath();
          target.rect(x, top + fontSize * TEXT_UNDERLINE_OFFSET, seg.width, thickness);
          target.fill();
        }
        if (deco.strikethrough) {
          target.beginPath();
          target.rect(
            x,
            top + fontSize * TEXT_STRIKETHROUGH_OFFSET - thickness / 2,
            seg.width,
            thickness,
          );
          target.fill();
        }
      }
      x += seg.width;
    }
  });
  // Markers use the element's base font/colour, after the segments so the
  // font state is deterministic.
  setSegFont(undefined);
  drawListMarkersForLayout(shape, layout, target, shape.style.fill ?? "#000");
};

const drawText: ElementRenderer<TextElement> = (shape, target, ctx) => {
  // Empty text while writing: draw the element's placeholder prompt in the
  // neutral grey, with the element's own font / alignment so the caret and
  // the prompt line up. Interactive rendering only (`ctx.textPlaceholders`).
  if (shape.text === "" && ctx?.textPlaceholders === true) {
    const { runs: _runs, ...plain } = shape;
    drawText(
      {
        ...plain,
        text: pickTextPlaceholder(shape.id),
        style: { ...shape.style, fill: TEXT_PLACEHOLDER_COLOR },
      },
      target,
    );
    return;
  }
  // Rich text (styled runs) takes a dedicated path; plain text keeps the
  // original single-style path byte-for-byte (golden-SVG compatible).
  if (shape.runs !== undefined && shape.runs.length > 0) {
    drawStyledText(shape, target);
    return;
  }
  const align = shape.style.textAlign ?? "left";
  const weight = shape.style.fontWeight;
  const fontStyle = shape.style.fontStyle;
  target.setFont(shape.fontFamily, shape.fontSize, {
    ...(weight ? { weight } : {}),
    ...(fontStyle ? { style: fontStyle } : {}),
  });
  // Lines are positioned manually (per-line x below) so the caret
  // geometry computed from the same `layoutText` lines up exactly, so
  // the target always draws left-anchored.
  target.setTextAlign("left");
  target.setTextBaseline(shape.style.textBaseline ?? "top");

  // Color: use fill if specified, otherwise default to black.
  const color = shape.style.fill ?? "#000";
  target.setFill(color);
  if (shape.style.opacity !== undefined) target.setOpacity(shape.style.opacity);

  // Resolve per-line geometry once (x = align offset, top = i ×
  // lineHeight). Single-line text without list attrs skips the wrap engine.
  const fontSize = shape.fontSize;
  let lines: { text: string; x: number; width: number; top: number }[];
  if (
    shape.maxWidth === undefined &&
    !shape.text.includes("\n") &&
    shape.paragraphs === undefined
  ) {
    lines = [{ text: shape.text, x: 0, width: target.measureText(shape.text).width, top: 0 }];
  } else {
    // Measure with the target's own `measureText` so wrapping matches
    // exactly what this backend draws.
    const measure = (s: string) => target.measureText(s).width;
    const layout = layoutText(shape.text, measure, {
      fontSize,
      ...(shape.maxWidth !== undefined ? { maxWidth: shape.maxWidth } : {}),
      ...(shape.paragraphs !== undefined ? { paragraphs: shape.paragraphs } : {}),
    });
    lines = layout.lines.map((line, i) => ({
      text: line.text,
      x: lineLeft(line, layout.blockWidth, align),
      width: line.width,
      top: i * layout.lineHeight,
    }));
    const clip = clipWindowOf(shape);
    if (clip !== undefined) lines = lines.filter((_, i) => i >= clip.start && i < clip.end);
    drawListMarkersForLayout(shape, layout, target, color);
  }

  // Highlight stripes under the glyphs (marker-style), then the text on top.
  const highlight = shape.style.highlight;
  if (highlight !== undefined && highlight !== "transparent") {
    const lineHeight = fontSize * DEFAULT_LINE_HEIGHT_FACTOR;
    target.setFill(highlight);
    for (const l of lines) {
      if (l.width <= 0) continue;
      target.beginPath();
      target.rect(l.x, l.top, l.width, lineHeight);
      target.fill();
    }
    target.setFill(color);
  }
  for (const l of lines) target.fillText(l.text, l.x, l.top);

  // Underline / strikethrough — thin filled rects per line, same on
  // Canvas2D and WebGL2 (uses the current text fill colour).
  const deco = shape.style.textDecoration;
  if (deco?.underline || deco?.strikethrough) {
    const thickness = Math.max(1, fontSize * TEXT_DECORATION_THICKNESS);
    for (const l of lines) {
      if (l.width <= 0) continue;
      if (deco.underline) {
        target.beginPath();
        target.rect(l.x, l.top + fontSize * TEXT_UNDERLINE_OFFSET, l.width, thickness);
        target.fill();
      }
      if (deco.strikethrough) {
        target.beginPath();
        target.rect(
          l.x,
          l.top + fontSize * TEXT_STRIKETHROUGH_OFFSET - thickness / 2,
          l.width,
          thickness,
        );
        target.fill();
      }
    }
  }
};

/**
 * Variable-width brush stroke. Each segment between two `BrushPoint`s
 * is drawn as a quad (two triangles) — its width interpolates from
 * `p.width` at the head to `q.width` at the tail. Renders
 * pressure-sensitive ink that gets thicker / thinner along the path
 * without needing per-segment `setStrokeWidth` calls (which most 2D
 * APIs treat as a single line width).
 */
const drawBrush: ElementRenderer<BrushElement> = (shape, target) => {
  const pts = shape.points;
  if (pts.length === 0) return;
  // Honour the stroke's opacity (drawBrush paints fills directly, so it can't
  // rely on the shared `applyStyle` the other renderers use). Set once up front
  // so both the enclosed-area fill and the body get it; the scene renderer resets
  // opacity to 1 between shapes.
  if (shape.style.opacity !== undefined) target.setOpacity(shape.style.opacity);
  // Closed stroke with a fill colour: paint the enclosed area FIRST (under the
  // stroke body) as a polygon through the centreline points. Needs ≥3 points to
  // enclose an area. Open strokes skip this entirely and are unchanged.
  if (shape.closed === true && shape.style.fill !== undefined && pts.length >= 3) {
    target.setFill(shape.style.fill);
    target.setStroke(null);
    target.beginPath();
    const start = req(pts[0]);
    target.moveTo(start.x, start.y);
    for (let i = 1; i < pts.length; i++) {
      const p = req(pts[i]);
      target.lineTo(p.x, p.y);
    }
    target.closePath();
    target.fill();
  }
  // The variable-width stroke body is painted with the shared brush-body colour
  // (the same resolution the live preview uses — see `brushBodyColor`).
  const paint = brushBodyColor(shape.style);
  target.setFill(paint);
  target.setStroke(null);
  // Single dot for one-point strokes — degenerate quad would be invisible.
  if (pts.length === 1) {
    const p = req(pts[0]);
    target.beginPath();
    target.ellipse(p.x, p.y, p.width, p.width);
    target.fill();
    return;
  }
  // Body as ONE closed outline polygon, filled once. Per-segment quads + joint
  // discs (the old approach) overlap, so at `opacity < 1` the joins double-blend
  // into dark blotches; a single fill paints every pixel exactly once.
  const outline = brushOutline(pts);
  if (outline.length >= 3) {
    target.beginPath();
    const first = req(outline[0]);
    target.moveTo(first.x, first.y);
    for (let i = 1; i < outline.length; i++) {
      const p = req(outline[i]);
      target.lineTo(p.x, p.y);
    }
    target.closePath();
    target.fill();
  }
};

const drawImage: ElementRenderer<ImageElement> = (shape, target, ctx) => {
  // Priority: for an animated source prefer the per-frame image the
  // registered adapter returns; otherwise a preloaded handle in
  // `metadata.image`; otherwise the static `src` fallback.
  // `resolveImageSource` returns `null` while an async decode is still
  // in flight, which the backend's drawImage guard skips.
  // Sample at the per-instance clock when the caller threaded one via the
  // render context; `undefined` defers to `resolveImageSource`'s process-global
  // fallback clock (headless / preview paths).
  const t = ctx?.clock?.(shape);
  const handle = shape.animationKind
    ? resolveImageSource(shape, t)
    : (shape.metadata?.image ?? resolveImageSource(shape, t));
  // A non-drawable handle with a `fileId` is a TRANSIENT state, not a
  // problem: the first paint after a scene restore runs before async
  // rehydration re-attaches a live handle from `Scene.files`. Skip the
  // frame silently — rehydration repaints when it lands, and reports its
  // own failure if the bytes are missing or won't decode. Only handles
  // with no rehydration source fall through to the backend, which warns
  // (the image really will stay blank).
  if (!isDrawableImageSource(handle)) {
    if (handle == null || shape.fileId) return;
  }
  // `dynamic` → backends that cache the upload (WebGL2) re-upload the
  // current frame. GIF / video sources flag `metadata.animated`, and
  // any adapter-driven source is dynamic by definition.
  const dynamic = shape.metadata?.animated === true || shape.animationKind !== undefined;
  const mask = shape.mask;
  if (mask) {
    target.save();
    target.beginPath();
    buildImageMaskPath(target, mask, shape.width, shape.height);
    target.clip();
  }
  target.drawImage(handle, 0, 0, shape.width, shape.height, dynamic, shape.crop);
  if (mask) target.restore();
};

/**
 * Build an {@link ImageMask}'s path in the shape's LOCAL space
 * (normalised mask coordinates × the element box). Exported so overlays
 * (crop/mask preview) can trace the same outline the renderer clips by.
 */
export const buildImageMaskPath = (
  target: RenderTarget,
  mask: ImageMask,
  width: number,
  height: number,
): void => {
  switch (mask.kind) {
    case "ellipse":
      target.ellipse(width / 2, height / 2, width / 2, height / 2);
      return;
    case "round-rect": {
      const r = Math.max(0, Math.min(0.5, mask.radius)) * Math.min(width, height);
      buildRoundedRectPath(target, 0, 0, width, height, r);
      return;
    }
    case "polygon": {
      const pts = mask.points;
      if (pts.length < 3) return;
      const first = req(pts[0]);
      target.moveTo(first.x * width, first.y * height);
      for (let i = 1; i < pts.length; i++) {
        const p = req(pts[i]);
        target.lineTo(p.x * width, p.y * height);
      }
      target.closePath();
      return;
    }
  }
};

/**
 * Registers renderers for every `BuiltinElement` type.
 */
export const installBuiltinRenderers = (): void => {
  registerElementRenderer<RectangleElement>("rectangle", drawRectangle);
  registerElementRenderer<EllipseElement>("ellipse", drawEllipse);
  registerElementRenderer<PolygonElement>("polygon", drawPolygon);
  registerElementRenderer<PathElement>("path", drawPath);
  registerElementRenderer<TextElement>("text", drawText);
  registerElementRenderer<ImageElement>("image", drawImage);
  // Group shapes are invisible containers — the shape itself paints nothing.
  registerElementRenderer<GroupElement>("group", () => {
    /* intentional no-op: group shapes are invisible containers and paint nothing */
  });
  registerElementRenderer<FrameElement>("frame", drawFrame);
  // The frame paints its header strip ABOVE the rectangle, so its dirty
  // region must extend up by the header height — otherwise deleting a
  // frame leaves the header behind.
  registerRenderOverflow("frame", () => ({ top: FRAME_HEADER_HEIGHT }));
  registerElementRenderer<BlockArrowElement>("block-arrow", drawBlockArrow);
  registerElementRenderer<BrushElement>("brush", drawBrush);
  registerElementRenderer<StickyElement>("sticky", drawSticky);
  // The sticky's drop shadow paints below its box — extend the dirty
  // region so moving/deleting it doesn't leave the shadow behind.
  registerRenderOverflow("sticky", (shape) => {
    // Worst-case invalidation bound for the reaction rows: every pill on
    // its own row (+ the "+" button row), at the largest world size the
    // visibility clamp allows (1 / the sticky's threshold zoom). Overflow
    // providers have no zoom access, so this over-approximates — costs
    // only redraw area, never leaves ghosts.
    const s = shape as StickyElement;
    const n = (s.reactions?.length ?? 0) + 1;
    const kMax = 1 / stickyReactionMinZoom(s);
    return {
      bottom:
        STICKY_SHADOW_OFFSET_Y + (STICKY_REACTION_GAP + STICKY_REACTION_HEIGHT) * kMax * n + 2,
      right: (STICKY_REACTION_GAP + STICKY_REACTION_HEIGHT) * kMax + 2,
    };
  });
  registerElementRenderer<EmojiElement>("emoji", drawEmoji);
};

/**
 * Block-arrow silhouette: a rectangle body whose tip is replaced
 * by a triangle, oriented by `direction`. Path is closed and filled
 * with `style.fill`; stroke applies to the outline.
 *
 *   right →  ┌────┐▶
 *             │ body │
 *            └────┘
 *
 *   up   ↑   ▲
 *           ┌──┐
 *           │  │
 *           └──┘
 */
const drawBlockArrow: ElementRenderer<BlockArrowElement> = (shape, target) => {
  const { fill, stroke } = applyStyle(shape.style, target);
  const direction = shape.direction ?? "right";
  const headRatio = Math.max(
    ARROWHEAD_RATIO_MIN,
    Math.min(ARROWHEAD_RATIO_MAX, shape.headRatio ?? ARROWHEAD_HEAD_RATIO),
  );
  const bodyT = Math.max(
    ARROWHEAD_RATIO_MIN,
    Math.min(ARROWHEAD_RATIO_MAX, shape.bodyThickness ?? ARROWHEAD_BODY_THICKNESS),
  );
  const w = shape.width;
  const h = shape.height;
  // Compute the local path for a `right`-pointing arrow inside
  // [0, w] × [0, h], then rotate the resulting points if the
  // direction is different. Keeps the drawing primitives in one
  // place.
  const headW = w * headRatio;
  const bodyW = w - headW;
  const bodyHalfH = (h * bodyT) / 2;
  const cy = h / 2;
  let points: readonly [number, number][] = [
    [0, cy - bodyHalfH],
    [bodyW, cy - bodyHalfH],
    [bodyW, 0],
    [w, cy],
    [bodyW, h],
    [bodyW, cy + bodyHalfH],
    [0, cy + bodyHalfH],
  ];
  if (direction !== "right") {
    points = points.map(([x, y]) => rotateLocal([x, y], direction, w, h));
  }
  const ptObjs = points.map(([x, y]) => ({ x, y }));
  if (fill) {
    target.beginPath();
    polygonPath(target, ptObjs);
    target.fill();
  }
  if (stroke) {
    const offset = strokeAlignOffset(shape.style);
    const sPts = offset !== 0 ? polygonMath.offsetClosedPath(ptObjs, offset) : ptObjs;
    target.beginPath();
    polygonPath(target, sPts);
    target.stroke();
  }
};

const rotateLocal = (
  [x, y]: readonly [number, number],
  direction: "left" | "up" | "down",
  w: number,
  h: number,
): [number, number] => {
  switch (direction) {
    case "left":
      return [w - x, y];
    case "up":
      // Rotate 90° CCW around the box centre, then translate so the
      // result still fits inside [0, w] × [0, h].
      return [y * (w / h), h - x * (h / w)];
    case "down":
      return [(h - y) * (w / h), x * (h / w)];
  }
};

const FRAME_HEADER_ELLIPSIS = "…";

/**
 * Trim `text` with a trailing ellipsis until it fits `maxWidth` (in the
 * font already set on `target`). Returns the full text when it fits, the
 * longest prefix + "…" otherwise, or just "…" when even one char can't
 * fit. Binary-searches the prefix length to keep `measureText` calls ~log.
 */
const ellipsizeToWidth = (text: string, maxWidth: number, target: RenderTarget): string => {
  if (maxWidth <= 0) return "";
  if (target.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const w = target.measureText(text.slice(0, mid) + FRAME_HEADER_ELLIPSIS).width;
    if (w <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo) + FRAME_HEADER_ELLIPSIS : FRAME_HEADER_ELLIPSIS;
};

const drawFrame: ElementRenderer<FrameElement> = (shape, target, ctx) => {
  // Body — solid fill + thin solid outline. Frames sit at the bottom
  // z-order, so the fill backs their members without covering them.
  // Honours an explicit `style.fill`, else default white.
  target.setFill(shape.style.fill ?? FRAME_FILL_COLOR);
  target.setStroke(null);
  target.setDashArray(null);
  target.beginPath();
  target.rect(0, 0, shape.width, shape.height);
  target.fill();
  // Outline on top of the fill — a 1px SCREEN-constant hairline (doesn't scale
  // with zoom). The renderer draws in local coords where 1 unit = zoom × scale
  // device px, so divide to keep the stroke at one device pixel. Falls back to
  // 1 world-px when no zoom context is supplied (preview / export at 1:1).
  const screenScale = (ctx?.zoom ?? 1) * (shape.scale.x || 1);
  target.setFill(null);
  target.setStroke(FRAME_STROKE_COLOR);
  target.setStrokeWidth(1 / (screenScale || 1));
  target.setDashArray(null);
  target.beginPath();
  target.rect(0, 0, shape.width, shape.height);
  target.stroke();

  // Header label: the strip hugs the text width but never exceeds the
  // frame's right edge; a name too long for the frame is ellipsised.
  const name = shape.name ?? "Frame";
  target.setFont("system-ui, sans-serif", FRAME_HEADER_FONT_SIZE);
  const avail = shape.width - FRAME_HEADER_PADDING_X * 2;
  const fits = target.measureText(name).width <= avail;
  // Fits → the strip hugs the text. Too long → ellipsise the text and
  // stretch the strip to the frame's full width (the label runs to the
  // right edge).
  const label = fits ? name : ellipsizeToWidth(name, avail, target);
  const headerWidth = fits
    ? Math.min(target.measureText(name).width + FRAME_HEADER_PADDING_X * 2, shape.width)
    : shape.width;

  // Header label background — stretches to fit the (possibly truncated) text.
  target.setFill(FRAME_HEADER_BG_COLOR);
  target.beginPath();
  target.rect(0, -FRAME_HEADER_HEIGHT, headerWidth, FRAME_HEADER_HEIGHT);
  target.fill();

  // Header label text.
  target.setFill(FRAME_HEADER_TEXT_COLOR);
  target.setTextBaseline("middle");
  target.setTextAlign("left");
  target.fillText(label, FRAME_HEADER_PADDING_X, -FRAME_HEADER_HEIGHT / 2);
};
