import {
 getLinkPath,
 getLinksInLayer,
 getLayersInOrder,
 getWorldToScreen,
 type Link,
 type LinkArrowheads,
 type LinkLabel,
 type Scene,
} from "@oh-just-another/scene";
import { bounds as B } from "@oh-just-another/math";
import type { Bounds, Vec2 } from "@oh-just-another/types";
import type { RenderTarget } from "./render-target.js";
import { sharedLinkBoundsCache, type LinkBoundsCache } from "./edge-cache.js";
import type { LinkBitmapCache } from "./edge-cache-bitmap.js";
import { zoomBucket as bucketFor } from "./shape-cache-bitmap.js";

export interface RenderLinksOptions {
 /**
  * Called for edges whose endpoints can't be resolved (e.g. anchor
  * endpoint references a missing shape). The default is to silently
  * skip them.
  */
 readonly onMissingEndpoint?: (edge: Link) => void;
 /**
  * World-space rect — only edges whose AABB intersects it are drawn.
  * Omit to draw every edge. Match `RenderSceneOptions.viewportWorld`
  * for consistent culling between shape and edge passes.
  */
 readonly viewportWorld?: Bounds;
 /**
  * Cache used to memoize per-edge world AABBs. Defaults to the shared
  * module-level cache so per-frame edge-bounds work is amortized across
  * paint passes.
  */
 readonly edgeBoundsCache?: LinkBoundsCache;
 /**
  * Optional dirty rectangle (world coords). Links whose AABB does
  * not intersect this rect are skipped — mirrors the same dirty-rect
  * filter `renderScene` applies to shapes. Caller is responsible for
  * having cleared the corresponding screen region.
  */
 readonly dirtyWorld?: Bounds;
 /**
  * Per-edge bitmap cache (). When supplied along with
  * `rasteriseLink`, edges whose object reference hasn't changed
  * AND whose zoom bucket matches are drawn from the cache via
  * `drawImage` instead of re-stroking the path. Pass `undefined`
  * to opt out — the rest of renderLinks works unchanged.
  */
 readonly edgeBitmapCache?: LinkBitmapCache<unknown>;
 /**
  * Host-side rasteriser: receives the edge, its world bbox, the
  * scene reference, and the active zoom bucket; returns the
  * image source to cache (`ImageBitmap`, `OffscreenCanvas`,
  * `HTMLCanvasElement` — anything the host's `RenderTarget.draw
  * Image` accepts). Returning `null` skips the cache for that
  * edge (e.g. an edge so small the bitmap isn't worth it).
  */
 readonly rasteriseLink?: (
  edge: Link,
  bounds: Bounds,
  scene: Scene,
  zoomBucket: number,
 ) => unknown | null;
 /**
  * Active zoom (defaults to `scene.viewport.zoom`). Cache lookups
  * round this through `zoomBucket()` so small camera adjustments
  * still hit the cache.
  */
 readonly zoom?: number;
}

/**
 * Draws every edge in the scene, in layer-then-z order. Resolves endpoints
 * through `getLinkPath` (which honours anchor refs and explicit waypoints)
 * and emits the appropriate primitive sequence for the edge's routing.
 *
 * Call this *after* `renderScene` so edges sit on top of shapes. Both
 * functions write to the same `RenderTarget` under the same scene-level
 * viewport transform, so coordinates align.
 */
export const renderLinks = (
 scene: Scene,
 target: RenderTarget,
 options: RenderLinksOptions = {},
): void => {
 // Self-contained transform setup so callers can do `renderScene(...);
 // renderLinks(...)` without repeating the world-to-screen step. We
 // never clear here — edges should land on top of an already-rendered
 // shape pass.
 target.save();
 target.setTransform(getWorldToScreen(scene.viewport));

 const cache = options.edgeBoundsCache ?? sharedLinkBoundsCache;
 const cull = options.viewportWorld;
 const dirty = options.dirtyWorld;
 const bitmapCache = options.edgeBitmapCache;
 const rasteriseLink = options.rasteriseLink;
 const zoomBucket = bucketFor(options.zoom ?? scene.viewport.zoom);

 for (const layer of getLayersInOrder(scene)) {
  if (!layer.visible) continue;
  for (const edge of getLinksInLayer(scene, layer.id)) {
   let bounds: Bounds | null = null;
   if (cull || dirty || (bitmapCache && rasteriseLink)) {
    bounds = cache.getOrCompute(scene, edge);
    if (bounds === null) {
     options.onMissingEndpoint?.(edge);
     continue;
    }
    if (cull && !B.intersects(bounds, cull)) continue;
    if (dirty && !B.intersects(bounds, dirty)) continue;
   }
   // Bitmap-cache fast path. Only fires when the host plugged
   // both a cache and a rasteriser — the kernel doesn't know how
   // to make ImageBitmaps without OffscreenCanvas import. Falls
   // through to the regular drawLink on cache miss + null
   // rasteriser result (e.g. host opted out for tiny edges).
   if (bitmapCache && rasteriseLink && bounds) {
    let bitmap = bitmapCache.get(edge, zoomBucket);
    if (bitmap === undefined) {
     const fresh = rasteriseLink(edge, bounds, scene, zoomBucket);
     if (fresh !== null) {
      bitmapCache.set(edge, zoomBucket, fresh);
      bitmap = fresh;
     }
    }
    if (bitmap !== undefined) {
     target.drawImage(bitmap, bounds.x, bounds.y, bounds.width, bounds.height);
     continue;
    }
   }
   drawLink(scene, edge, target, options);
  }
 }
 target.restore();
};

const drawLink = (
 scene: Scene,
 edge: Link,
 target: RenderTarget,
 options: RenderLinksOptions,
): void => {
 const path = getLinkPath(scene, edge);
 if (!path || path.length < 2) {
  options.onMissingEndpoint?.(edge);
  return;
 }

 target.save();

 if ((edge.lineKind ?? "line") === "block-arrow") {
  drawBlockArrowLink(edge, path, target);
 } else {
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
 }
 if (edge.label) {
  drawLabel(path, edge.label, target);
 }
 target.restore();
};

/**
 * Filled block-arrow edge: thickens the entire routed path into a
 * polygon by offsetting each segment perpendicularly by `thickness/2`
 * on both sides, then replaces the last `headLength` units with a
 * triangle pointing at `to`.
 *
 * Designed for orthogonal / straight routing — bezier-routed edges
 * still get block-arrow rendering but the head sits at the last
 * segment endpoint regardless of curve direction.
 */
const drawBlockArrowLink = (
 edge: Link,
 path: readonly Vec2[],
 target: RenderTarget,
): void => {
 const headLength = edge.blockArrow?.headLength ?? 18;
 const thickness = edge.blockArrow?.bodyThickness ?? 12;
 const fill = edge.style.fill ?? edge.style.stroke ?? "#444";
 const stroke = edge.style.stroke ?? "#222";
 const strokeWidth = edge.style.strokeWidth ?? 1;
 if (edge.style.opacity !== undefined) target.setOpacity(edge.style.opacity);

 // Shorten the path so the body terminates `headLength` units
 // before `to`; the head triangle fills the gap with a sharper
 // tip on the original endpoint.
 const shortened = shortenPathFromEnd(path, headLength);
 if (shortened.length < 2) return;

 // Offset the shortened polyline on both sides by `thickness/2`
 // to build the body polygon (manual one-segment offset — keeps
 // the math simple; mitre joins on orthogonal routes look fine).
 const left = offsetPolyline(shortened, thickness / 2);
 const right = offsetPolyline(shortened, -thickness / 2);
 const headBaseLeft = left[left.length - 1]!;
 const headBaseRight = right[right.length - 1]!;
 const tip = path[path.length - 1]!;

 target.setFill(fill);
 target.setStroke(stroke);
 target.setStrokeWidth(strokeWidth);
 target.beginPath();
 // Body upper edge — left[0] → left[last] (head base).
 target.moveTo(left[0]!.x, left[0]!.y);
 for (let i = 1; i < left.length; i++) target.lineTo(left[i]!.x, left[i]!.y);
 // Head triangle: head base (left) → tip → head base (right).
 // Add the "barbs" — the head is wider than the body so the user
 // reads it as a proper block-arrow head, not just a continuation.
 const barbExtra = Math.max(0, thickness * 0.5);
 const barbLeft = perpendicularOffset(headBaseLeft, tip, barbExtra);
 const barbRight = perpendicularOffset(headBaseRight, tip, -barbExtra);
 target.lineTo(barbLeft.x, barbLeft.y);
 target.lineTo(tip.x, tip.y);
 target.lineTo(barbRight.x, barbRight.y);
 // Body lower edge back — right[last] → right[0].
 for (let i = right.length - 1; i >= 0; i--) target.lineTo(right[i]!.x, right[i]!.y);
 target.closePath();
 target.fill();
 if (strokeWidth > 0) target.stroke();
};

/**
 * Walk the path from the start; drop the final `amount` world
 * units so the head triangle can fill that section. Returns at
 * least one segment (the original first segment) when the path
 * is shorter than `amount`.
 */
const shortenPathFromEnd = (path: readonly Vec2[], amount: number): readonly Vec2[] => {
 if (path.length < 2) return path;
 let remaining = amount;
 const reversed = [...path].reverse();
 const out: Vec2[] = [reversed[0]!];
 for (let i = 1; i < reversed.length; i++) {
  const a = out[out.length - 1]!;
  const b = reversed[i]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len > remaining) {
   const t = remaining / len;
   const cut = { x: a.x + dx * t, y: a.y + dy * t };
   out[out.length - 1] = cut;
   // Push everything after the cut in original order.
   out.push(...reversed.slice(i));
   return out.reverse();
  }
  remaining -= len;
  out[out.length - 1] = b;
 }
 // amount > path length — degenerate; return original.
 return path;
};

/**
 * Per-vertex perpendicular offset of a polyline. Simple — works
 * well for orthogonal / straight routing; bezier-routed paths get
 * piecewise approximations.
 */
const offsetPolyline = (path: readonly Vec2[], offset: number): readonly Vec2[] => {
 if (path.length < 2) return path;
 const out: Vec2[] = [];
 for (let i = 0; i < path.length; i++) {
  const prev = path[Math.max(0, i - 1)]!;
  const next = path[Math.min(path.length - 1, i + 1)]!;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  out.push({ x: path[i]!.x + nx * offset, y: path[i]!.y + ny * offset });
 }
 return out;
};

/**
 * Move `from` perpendicular to the `from→tip` direction by
 * `amount` world units. Positive amount → left of the direction
 * vector, negative → right.
 */
const perpendicularOffset = (from: Vec2, tip: Vec2, amount: number): Vec2 => {
 const dx = tip.x - from.x;
 const dy = tip.y - from.y;
 const len = Math.hypot(dx, dy) || 1;
 const nx = -dy / len;
 const ny = dx / len;
 return { x: from.x + nx * amount, y: from.y + ny * amount };
};

const applyStrokeStyle = (edge: Link, target: RenderTarget): void => {
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
 heads: LinkArrowheads,
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
 style: Exclude<LinkArrowheads["from"], "none" | undefined>,
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

const drawLabel = (path: readonly Vec2[], label: LinkLabel, target: RenderTarget): void => {
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
