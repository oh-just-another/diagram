import { polygon as polygonMath } from "@oh-just-another/math";
import {
  getCornerRadius,
  registerRenderOverflow,
  type BlockArrowElement,
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
} from "@oh-just-another/scene";
import { registerElementRenderer, type ElementRenderer } from "./shape-renderer.js";
import type { RenderTarget } from "./render-target.js";
import { layoutText } from "./text-editing.js";
import { resolveImageSource } from "./animation-adapter.js";
import {
  TEXT_DECORATION_THICKNESS,
  TEXT_UNDERLINE_OFFSET,
  TEXT_STRIKETHROUGH_OFFSET,
} from "./constants.js";

const req = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error("packages/renderer-core: index out of range");
  return v;
};

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
 * adjacent side. WebGL2Target's zoom-aware flattener turns this
 * into enough chord segments to stay sub-pixel smooth at any zoom.
 *
 * Radius `r` is pre-clamped by `getCornerRadius` to half the
 * smaller side, so no overlap-handling is needed here.
 */
const buildRoundedRectPath = (
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
    const pts = offset !== 0
      ? polygonMath.offsetClosedPath(shape.points, offset)
      : shape.points;
    target.beginPath();
    polygonPath(target, pts);
    target.stroke();
  }
};

/** Emit a closed polygon outline as `moveTo` + `lineTo`s + `closePath`. */
const polygonPath = (target: RenderTarget, pts: readonly { x: number; y: number }[]): void => {
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

const drawText: ElementRenderer<TextElement> = (shape, target) => {
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
  // lineHeight). Single-line text skips the wrap engine.
  const fontSize = shape.fontSize;
  let lines: { text: string; x: number; width: number; top: number }[];
  if (shape.maxWidth === undefined && !shape.text.includes("\n")) {
    lines = [{ text: shape.text, x: 0, width: target.measureText(shape.text).width, top: 0 }];
  } else {
    // Measure with the target's own `measureText` so wrapping matches
    // exactly what this backend draws (WebGL2 reports MSDF advances; the
    // selection-box bounder + caret use the same source).
    const measure = (s: string) => target.measureText(s).width;
    const layout = layoutText(shape.text, measure, {
      fontSize,
      ...(shape.maxWidth !== undefined ? { maxWidth: shape.maxWidth } : {}),
    });
    lines = layout.lines.map((line, i) => ({
      text: line.text,
      x:
        align === "center"
          ? layout.blockWidth / 2 - line.width / 2
          : align === "right"
            ? layout.blockWidth - line.width
            : 0,
      width: line.width,
      top: i * layout.lineHeight,
    }));
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
        target.rect(l.x, l.top + fontSize * TEXT_STRIKETHROUGH_OFFSET - thickness / 2, l.width, thickness);
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
  const fill = shape.style.fill ?? shape.style.stroke ?? "#000";
  target.setFill(fill);
  target.setStroke(null);
  // Single dot for one-point strokes — degenerate quad would be invisible.
  if (pts.length === 1) {
    const p = req(pts[0]);
    target.beginPath();
    target.ellipse(p.x, p.y, p.width, p.width);
    target.fill();
    return;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = req(pts[i]);
    const b = req(pts[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    target.beginPath();
    target.moveTo(a.x + nx * a.width, a.y + ny * a.width);
    target.lineTo(b.x + nx * b.width, b.y + ny * b.width);
    target.lineTo(b.x - nx * b.width, b.y - ny * b.width);
    target.lineTo(a.x - nx * a.width, a.y - ny * a.width);
    target.closePath();
    target.fill();
    // End-cap as a disk at the joint — smooths the kink between segments.
    target.beginPath();
    target.ellipse(b.x, b.y, b.width, b.width);
    target.fill();
  }
};

const drawImage: ElementRenderer<ImageElement> = (shape, target) => {
  // Priority: preloaded handle in metadata.image → animation-adapter
  // frame (when `animationKind` is set and a matching adapter is
  // registered) → static `src` fallback.
  // For an animated source (GIF) prefer the per-frame image the
  // registered adapter returns over `metadata.image` (a static
  // first-frame `<img>`). `resolveImageSource` consults the adapter
  // with `performance.now()`; it returns `null` while the async
  // decode is still in flight — the backend's drawImage guard skips
  // a null handle and the next AnimationTick frame picks it up.
  const handle = shape.animationKind
    ? resolveImageSource(shape)
    : (shape.metadata?.image ?? resolveImageSource(shape));
  // `dynamic` → backends that cache the upload (WebGL2) re-upload the
  // current frame. GIF / video sources flag `metadata.animated`, and
  // any adapter-driven source is dynamic by definition.
  const dynamic = shape.metadata?.animated === true || shape.animationKind !== undefined;
  target.drawImage(handle, 0, 0, shape.width, shape.height, dynamic);
};

/**
 * Registers renderers for every `BuiltinElement` type. Called by side-effect
 * import of `@oh-just-another/renderer-canvas/setup` (see index).
 */
export const installBuiltinRenderers = (): void => {
  registerElementRenderer<RectangleElement>("rectangle", drawRectangle);
  registerElementRenderer<EllipseElement>("ellipse", drawEllipse);
  registerElementRenderer<PolygonElement>("polygon", drawPolygon);
  registerElementRenderer<PathElement>("path", drawPath);
  registerElementRenderer<TextElement>("text", drawText);
  registerElementRenderer<ImageElement>("image", drawImage);
  // Group shapes are invisible containers — the editor's overlay draws
  // a halo for selected groups, but the shape itself paints nothing.
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
  const headRatio = Math.max(0.1, Math.min(0.9, shape.headRatio ?? 0.4));
  const bodyT = Math.max(0.1, Math.min(0.9, shape.bodyThickness ?? 0.5));
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

/**
 * Frame: dashed outline + header strip with the frame's name.
 * Hit-testing intentionally passes through the body (handled
 * editor-side) so clicks on children inside the frame still land on
 * the child, not the frame chrome.
 */
const FRAME_STROKE = "#888";
const FRAME_HEADER_HEIGHT = 24;

const drawFrame: ElementRenderer<FrameElement> = (shape, target) => {
  // Body — dashed rectangle.
  target.setFill(null);
  target.setStroke(FRAME_STROKE);
  target.setStrokeWidth(1);
  target.setDashArray([6, 4]);
  target.beginPath();
  target.rect(0, 0, shape.width, shape.height);
  target.stroke();
  target.setDashArray(null);

  // Header label background.
  const name = shape.name ?? "Frame";
  target.setFill("#222");
  target.beginPath();
  target.rect(0, -FRAME_HEADER_HEIGHT, Math.min(160, shape.width), FRAME_HEADER_HEIGHT);
  target.fill();

  // Header label text.
  target.setFill("#ddd");
  target.setFont("system-ui, sans-serif", 12);
  target.setTextBaseline("middle");
  target.setTextAlign("left");
  target.fillText(name, 8, -FRAME_HEADER_HEIGHT / 2);
};
