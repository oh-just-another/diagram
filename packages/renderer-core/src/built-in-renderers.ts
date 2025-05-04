import {
  getCornerRadius,
  type BlockArrowShape,
  type BrushShape,
  type EllipseShape,
  type FrameShape,
  type GroupShape,
  type ImageShape,
  type PathShape,
  type PolygonShape,
  type RectangleShape,
  type Style,
  type TextShape,
} from "@oh-just-another/scene";
import { registerShapeRenderer, type ShapeRenderer } from "./shape-renderer.js";
import type { RenderTarget } from "./render-target.js";
import { wrapText } from "./text-layout.js";
import { getActiveTextShaper } from "./text-shaper.js";
import { resolveImageSource } from "./animation-adapter.js";

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

const drawRectangle: ShapeRenderer<RectangleShape> = (shape, target) => {
  const { fill, stroke } = applyStyle(shape.style, target);
  if (!fill && !stroke) return;
  const r = getCornerRadius(shape.style.roundness, shape.width, shape.height);
  target.beginPath();
  if (r > 0) {
    buildRoundedRectPath(target, 0, 0, shape.width, shape.height, r);
  } else {
    target.rect(0, 0, shape.width, shape.height);
  }
  if (fill) target.fill();
  if (stroke) target.stroke();
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

const drawEllipse: ShapeRenderer<EllipseShape> = (shape, target) => {
  const { fill, stroke } = applyStyle(shape.style, target);
  if (!fill && !stroke) return;
  const rx = shape.width / 2;
  const ry = shape.height / 2;
  target.beginPath();
  target.ellipse(rx, ry, rx, ry);
  if (fill) target.fill();
  if (stroke) target.stroke();
};

const drawPolygon: ShapeRenderer<PolygonShape> = (shape, target) => {
  if (shape.points.length < 2) return;
  const { fill, stroke } = applyStyle(shape.style, target);
  if (!fill && !stroke) return;
  target.beginPath();
  const first = shape.points[0]!;
  target.moveTo(first.x, first.y);
  for (let i = 1; i < shape.points.length; i++) {
    const p = shape.points[i]!;
    target.lineTo(p.x, p.y);
  }
  target.closePath();
  if (fill) target.fill();
  if (stroke) target.stroke();
};

const drawPath: ShapeRenderer<PathShape> = (shape, target) => {
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

const drawText: ShapeRenderer<TextShape> = (shape, target) => {
  target.setFont(shape.fontFamily, shape.fontSize);
  const align = shape.style.textAlign ?? "left";
  const baseline = shape.style.textBaseline ?? "top";
  target.setTextAlign(align);
  target.setTextBaseline(baseline);

  // Color: use fill if specified, otherwise default to black.
  const color = shape.style.fill ?? "#000";
  target.setFill(color);
  if (shape.style.opacity !== undefined) target.setOpacity(shape.style.opacity);

  const xAnchor =
    align === "center" ? (shape.maxWidth ?? 0) / 2 : align === "right" ? (shape.maxWidth ?? 0) : 0;

  if (shape.maxWidth === undefined) {
    // Single line, no wrapping.
    target.fillText(shape.text, xAnchor, 0);
    return;
  }

  const shaper = getActiveTextShaper();
  const { lines, lineHeight } = wrapText(shape.text, target, {
    maxWidth: shape.maxWidth,
    fontSize: shape.fontSize,
    fontFamily: shape.fontFamily,
    ...(shaper ? { shaper } : {}),
  });
  for (let i = 0; i < lines.length; i++) {
    target.fillText(lines[i]!.text, xAnchor, i * lineHeight);
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
const drawBrush: ShapeRenderer<BrushShape> = (shape, target) => {
  const pts = shape.points;
  if (pts.length === 0) return;
  const fill = shape.style.fill ?? shape.style.stroke ?? "#000";
  target.setFill(fill);
  target.setStroke(null);
  // Single dot for one-point strokes — degenerate quad would be invisible.
  if (pts.length === 1) {
    const p = pts[0]!;
    target.beginPath();
    target.ellipse(p.x, p.y, p.width, p.width);
    target.fill();
    return;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
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

const drawImage: ShapeRenderer<ImageShape> = (shape, target) => {
  // Priority: preloaded handle in metadata.image → animation-adapter
  // frame (when `animationKind` is set and a matching adapter is
  // registered) → static `src` fallback.
  const handle =
    shape.metadata?.image ?? resolveImageSource(shape);
  target.drawImage(handle, 0, 0, shape.width, shape.height);
};

/**
 * Registers renderers for every `BuiltinShape` type. Called by side-effect
 * import of `@oh-just-another/renderer-canvas/setup` (see index).
 */
export const installBuiltinRenderers = (): void => {
  registerShapeRenderer<RectangleShape>("rectangle", drawRectangle);
  registerShapeRenderer<EllipseShape>("ellipse", drawEllipse);
  registerShapeRenderer<PolygonShape>("polygon", drawPolygon);
  registerShapeRenderer<PathShape>("path", drawPath);
  registerShapeRenderer<TextShape>("text", drawText);
  registerShapeRenderer<ImageShape>("image", drawImage);
  // Group shapes are invisible containers — the editor's overlay draws
  // a halo for selected groups, but the shape itself paints nothing.
  registerShapeRenderer<GroupShape>("group", () => {});
  registerShapeRenderer<FrameShape>("frame", drawFrame);
  registerShapeRenderer<BlockArrowShape>("block-arrow", drawBlockArrow);
  registerShapeRenderer<BrushShape>("brush", drawBrush);
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
const drawBlockArrow: ShapeRenderer<BlockArrowShape> = (shape, target) => {
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
  target.beginPath();
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]!;
    if (i === 0) target.moveTo(x, y);
    else target.lineTo(x, y);
  }
  target.closePath();
  if (fill) target.fill();
  if (stroke) target.stroke();
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

const drawFrame: ShapeRenderer<FrameShape> = (shape, target) => {
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
