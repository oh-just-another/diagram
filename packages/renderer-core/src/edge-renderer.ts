import {
  getEdgePath,
  getEdgesInLayer,
  getLayersInOrder,
  getWorldToScreen,
  type Edge,
  type EdgeArrowheads,
  type EdgeLabel,
  type Scene,
} from "@oh-just-another/scene";
import type { Vec2 } from "@oh-just-another/types";
import type { RenderTarget } from "./render-target.js";

export interface RenderEdgesOptions {
  /**
   * Called for edges whose endpoints can't be resolved (e.g. anchor
   * endpoint references a missing shape). The default is to silently
   * skip them.
   */
  readonly onMissingEndpoint?: (edge: Edge) => void;
}

/**
 * Draws every edge in the scene, in layer-then-z order. Resolves endpoints
 * through `getEdgePath` (which honours anchor refs and explicit waypoints)
 * and emits the appropriate primitive sequence for the edge's routing.
 *
 * Call this *after* `renderScene` so edges sit on top of shapes. Both
 * functions write to the same `RenderTarget` under the same scene-level
 * viewport transform, so coordinates align.
 */
export const renderEdges = (
  scene: Scene,
  target: RenderTarget,
  options: RenderEdgesOptions = {},
): void => {
  // Self-contained transform setup so callers can do `renderScene(...);
  // renderEdges(...)` without repeating the world-to-screen step. We
  // never clear here — edges should land on top of an already-rendered
  // shape pass.
  target.save();
  target.setTransform(getWorldToScreen(scene.viewport));

  for (const layer of getLayersInOrder(scene)) {
    if (!layer.visible) continue;
    for (const edge of getEdgesInLayer(scene, layer.id)) {
      drawEdge(scene, edge, target, options);
    }
  }
  target.restore();
};

const drawEdge = (
  scene: Scene,
  edge: Edge,
  target: RenderTarget,
  options: RenderEdgesOptions,
): void => {
  const path = getEdgePath(scene, edge);
  if (!path || path.length < 2) {
    options.onMissingEndpoint?.(edge);
    return;
  }

  target.save();
  applyStrokeStyle(edge, target);

  target.beginPath();
  target.moveTo(path[0]!.x, path[0]!.y);

  if ((edge.routing ?? "straight") === "bezier" && path.length === 2) {
    const [from, to] = path as [Vec2, Vec2];
    const c1 = controlPoint(from, to, 0.4);
    const c2 = controlPoint(to, from, 0.4);
    target.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
  } else {
    for (let i = 1; i < path.length; i++) target.lineTo(path[i]!.x, path[i]!.y);
  }
  target.stroke();

  if (edge.arrowheads) {
    drawArrowheads(path, edge.arrowheads, target);
  }
  if (edge.label) {
    drawLabel(path, edge.label, target);
  }
  target.restore();
};

const applyStrokeStyle = (edge: Edge, target: RenderTarget): void => {
  const stroke = edge.style.stroke ?? "#000";
  target.setStroke(stroke);
  target.setFill(null);
  target.setStrokeWidth(edge.style.strokeWidth ?? 1);
  if (edge.style.opacity !== undefined) target.setOpacity(edge.style.opacity);
  if (edge.style.lineCap !== undefined) target.setLineCap(edge.style.lineCap);
  if (edge.style.lineJoin !== undefined) target.setLineJoin(edge.style.lineJoin);
  target.setDashArray(edge.style.dashArray ?? null);
};

// Horizontal projection for bezier control points — pulls toward the
// "natural" exit direction of each endpoint. `t` controls how far the
// control point sits between `from` and `to`.
const controlPoint = (from: Vec2, to: Vec2, t: number): Vec2 => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Bias toward horizontal pull when the segment is mostly horizontal,
  // vertical pull otherwise — produces curves that resemble flowchart
  // connectors instead of generic S-shapes.
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: from.x + dx * t, y: from.y };
  }
  return { x: from.x, y: from.y + dy * t };
};

const drawArrowheads = (
  path: readonly Vec2[],
  heads: EdgeArrowheads,
  target: RenderTarget,
): void => {
  const size = heads.size ?? 10;
  if (heads.from && heads.from !== "none") {
    const tip = path[0]!;
    const next = path[1]!;
    drawArrowhead(tip, next, heads.from, size, target);
  }
  if (heads.to && heads.to !== "none") {
    const tip = path[path.length - 1]!;
    const prev = path[path.length - 2]!;
    drawArrowhead(tip, prev, heads.to, size, target);
  }
};

const drawArrowhead = (
  tip: Vec2,
  fromPoint: Vec2,
  style: Exclude<EdgeArrowheads["from"], "none" | undefined>,
  size: number,
  target: RenderTarget,
): void => {
  // Unit vector pointing away from the tip toward the previous point.
  const dx = fromPoint.x - tip.x;
  const dy = fromPoint.y - tip.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular.
  const px = -uy;
  const py = ux;

  target.beginPath();
  switch (style) {
    case "arrow": {
      // Open arrowhead — two strokes back from the tip.
      const baseX = tip.x + ux * size;
      const baseY = tip.y + uy * size;
      target.moveTo(tip.x, tip.y);
      target.lineTo(baseX + px * size * 0.5, baseY + py * size * 0.5);
      target.moveTo(tip.x, tip.y);
      target.lineTo(baseX - px * size * 0.5, baseY - py * size * 0.5);
      target.stroke();
      break;
    }
    case "triangle": {
      const baseX = tip.x + ux * size;
      const baseY = tip.y + uy * size;
      target.moveTo(tip.x, tip.y);
      target.lineTo(baseX + px * size * 0.5, baseY + py * size * 0.5);
      target.lineTo(baseX - px * size * 0.5, baseY - py * size * 0.5);
      target.closePath();
      // Filled with the stroke colour for visibility on any background.
      target.setFill(null);
      target.stroke();
      break;
    }
    case "diamond": {
      const half = size / 2;
      const back = { x: tip.x + ux * size, y: tip.y + uy * size };
      target.moveTo(tip.x, tip.y);
      target.lineTo(back.x + px * half, back.y + py * half);
      target.lineTo(tip.x + ux * size * 2, tip.y + uy * size * 2);
      target.lineTo(back.x - px * half, back.y - py * half);
      target.closePath();
      target.stroke();
      break;
    }
    case "circle": {
      const r = size / 2;
      const cx = tip.x + ux * r;
      const cy = tip.y + uy * r;
      target.ellipse(cx, cy, r, r);
      target.stroke();
      break;
    }
  }
};

const drawLabel = (path: readonly Vec2[], label: EdgeLabel, target: RenderTarget): void => {
  const t = label.position ?? 0.5;
  const fontSize = label.fontSize ?? 12;
  const fill = label.fill ?? "#222";
  const bg = label.background ?? "#fff";
  const point = pointAlongPath(path, t);
  const halfWidth = label.text.length * fontSize * 0.3 + 4; // rough estimate
  const halfHeight = fontSize * 0.7;

  // Pill background so the label is readable over the line.
  target.beginPath();
  target.setFill(bg);
  target.setStroke(null);
  target.rect(point.x - halfWidth, point.y - halfHeight, halfWidth * 2, halfHeight * 2);
  target.fill();

  target.setFill(fill);
  target.setFont("system-ui, sans-serif", fontSize);
  target.setTextAlign("center");
  target.setTextBaseline("middle");
  target.fillText(label.text, point.x, point.y);
};

const pointAlongPath = (path: readonly Vec2[], t: number): Vec2 => {
  if (path.length === 2) {
    const [a, b] = path as [Vec2, Vec2];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  // Walk segments by cumulative length and find the point at `t * total`.
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i]!.x - path[i - 1]!.x;
    const dy = path[i]!.y - path[i - 1]!.y;
    const len = Math.hypot(dx, dy);
    lengths.push(len);
    total += len;
  }
  let remaining = total * t;
  for (let i = 0; i < lengths.length; i++) {
    const segLen = lengths[i]!;
    if (remaining <= segLen) {
      const ratio = segLen === 0 ? 0 : remaining / segLen;
      const a = path[i]!;
      const b = path[i + 1]!;
      return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
    }
    remaining -= segLen;
  }
  return path[path.length - 1]!;
};
