import {
 type EllipseShape,
 type ImageShape,
 type PathShape,
 type PolygonShape,
 type RectangleShape,
 type Style,
 type TextShape,
} from "@oh-just-another/scene";
import { registerShapeRenderer, type ShapeRenderer } from "./shape-renderer";
import type { RenderTarget } from "./render-target";
import { wrapText } from "./text-layout";

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
 target.beginPath();
 target.rect(0, 0, shape.width, shape.height);
 if (fill) target.fill();
 if (stroke) target.stroke();
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

 const { lines, lineHeight } = wrapText(shape.text, target, {
  maxWidth: shape.maxWidth,
  fontSize: shape.fontSize,
 });
 for (let i = 0; i < lines.length; i++) {
  target.fillText(lines[i]!.text, xAnchor, i * lineHeight);
 }
};

const drawImage: ShapeRenderer<ImageShape> = (shape, target) => {
 // The shape carries a URL string; the host app is responsible for resolving
 // it into a `CanvasImageSource` before calling the renderer. As a // safe default, we accept the URL directly via `target.drawImage` and let
 // the backend reject it — most use cases preload images and put the
 // handle into `shape.metadata.image`.
 const handle = shape.metadata?.image ?? shape.src;
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
};
