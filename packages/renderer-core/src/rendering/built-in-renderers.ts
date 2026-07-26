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
  type BrushElement,
  type EllipseElement,
  type FrameElement,
  type GroupElement,
  type ImageElement,
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
} from "@oh-just-another/scene";
import { registerElementRenderer, type ElementRenderer } from "./shape-renderer.js";
import type { RenderTarget } from "../targets/render-target.js";
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
 * Geometry of an embedded shape label: the synthetic text element the
 * text renderer can draw, plus the local-space offset where it starts.
 * Shared by the renderer and the inline-edit caret path (state) so the
 * glyphs and the caret can't drift apart.
 */
export const shapeLabelLayout = (
  shape: ElementBase,
  measure: (s: string) => number,
): {
  readonly synthetic: TextElement;
  readonly offsetX: number;
  readonly offsetY: number;
} | null => {
  const label = shape.label;
  if (label === undefined) return null;
  const bounds = getElementLocalBounds(shape);
  const pad = LABEL_PADDING_EM * label.fontSize;
  const maxWidth = Math.max(label.fontSize, bounds.width - 2 * pad);
  const style: TextStyle = {
    textAlign: "center",
    textBaseline: "middle",
    ...label.style,
  };
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
    fontSize: label.fontSize,
    maxWidth,
    ...(label.runs !== undefined ? { runs: label.runs } : {}),
    ...(label.paragraphs !== undefined ? { paragraphs: label.paragraphs } : {}),
  } as TextElement;
  const layout = layoutText(label.text, measure, {
    fontSize: label.fontSize,
    maxWidth,
    ...(label.paragraphs !== undefined ? { paragraphs: label.paragraphs } : {}),
  });
  const textH = layout.lines.length * layout.lineHeight;
  const valign = style.textBaseline ?? "middle";
  const offsetY =
    valign === "top"
      ? bounds.y + pad
      : valign === "bottom"
        ? bounds.y + bounds.height - textH - pad
        : bounds.y + (bounds.height - textH) / 2;
  return { synthetic, offsetX: bounds.x + pad, offsetY };
};

/**
 * Draw a shape's embedded label inside its local bounds. Reuses the text
 * renderer wholesale (wrap, runs, lists, highlight); vertical alignment
 * places the whole block, `textAlign` centres lines within the padded
 * width. Called by the scene renderer after the shape body.
 */
export const drawShapeLabel = (shape: ElementBase, target: RenderTarget): void => {
  const label = shape.label;
  if (label === undefined || label.text === "") return;
  // Measure with the label's base font — same metrics drawText wraps with.
  const weight = label.style?.fontWeight;
  const fontStyle = label.style?.fontStyle;
  target.setFont(label.fontFamily, label.fontSize, {
    ...(weight ? { weight } : {}),
    ...(fontStyle ? { style: fontStyle } : {}),
  });
  const placed = shapeLabelLayout(shape, (s) => target.measureText(s).width);
  if (!placed) return;
  target.save();
  target.translate(placed.offsetX, placed.offsetY);
  drawText(placed.synthetic, target);
  target.restore();
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
  layout.lines.forEach((line, i) => {
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

  perLine.forEach((line, i) => {
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

const drawText: ElementRenderer<TextElement> = (shape, target) => {
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
  target.drawImage(handle, 0, 0, shape.width, shape.height, dynamic, shape.crop);
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
