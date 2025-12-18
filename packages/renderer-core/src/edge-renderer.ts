import {
 flattenSegments,
 getLinkCurveSegments,
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
import { LINK_CORNER_RADIUS } from "./constants.js";

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

  // Curved (bezier): draw the cubic-bezier curve resolved by scene — a
  // no-waypoint span exits/enters perpendicular to the element edges
  // (flowchart look); a waypointed span splines through the bends. The
  // flattened curve feeds the arrowhead so its tangent matches.
  const curve = (edge.routing ?? "straight") === "bezier" ? getLinkCurveSegments(scene, edge) : null;

  target.beginPath();
  if (curve) {
   target.moveTo(curve.start.x, curve.start.y);
   for (const s of curve.segments) {
    target.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.to.x, s.to.y);
   }
  } else if (path.length >= 3 && LINK_CORNER_RADIUS > 0) {
   // Rounded bends for elbow / waypointed-straight connectors.
   strokeRoundedPolyline(target, path, LINK_CORNER_RADIUS);
  } else {
   target.moveTo(path[0]!.x, path[0]!.y);
   for (let i = 1; i < path.length; i++) target.lineTo(path[i]!.x, path[i]!.y);
  }
  target.stroke();

  if (edge.arrowheads) {
   const headPath = curve ? flattenSegments(curve.start, curve.segments) : path;
   drawArrowheads(headPath, edge.arrowheads, target, edge.style.stroke ?? "#000");
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

/**
 * Stroke a polyline with rounded corners: each interior vertex is replaced
 * by a quadratic arc of `radius` (clamped to half the shorter adjacent
 * segment). Works for 90° elbow bends and arbitrary-angle waypoint bends.
 * Caller has already `beginPath()`.
 */
const strokeRoundedPolyline = (
 target: RenderTarget,
 pts: readonly Vec2[],
 radius: number,
): void => {
 target.moveTo(pts[0]!.x, pts[0]!.y);
 for (let i = 1; i < pts.length - 1; i++) {
  const prev = pts[i - 1]!;
  const cur = pts[i]!;
  const next = pts[i + 1]!;
  const l1 = Math.hypot(prev.x - cur.x, prev.y - cur.y);
  const l2 = Math.hypot(next.x - cur.x, next.y - cur.y);
  if (l1 === 0 || l2 === 0) {
   target.lineTo(cur.x, cur.y);
   continue;
  }
  const r = Math.min(radius, l1 / 2, l2 / 2);
  const a = { x: cur.x + ((prev.x - cur.x) / l1) * r, y: cur.y + ((prev.y - cur.y) / l1) * r };
  const b = { x: cur.x + ((next.x - cur.x) / l2) * r, y: cur.y + ((next.y - cur.y) / l2) * r };
  target.lineTo(a.x, a.y);
  target.quadraticCurveTo(cur.x, cur.y, b.x, b.y);
 }
 target.lineTo(pts[pts.length - 1]!.x, pts[pts.length - 1]!.y);
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

const drawArrowheads = (
 path: readonly Vec2[],
 heads: LinkArrowheads,
 target: RenderTarget,
 color: string,
): void => {
 const size = heads.size ?? 10;
 if (heads.from && heads.from !== "none") {
  const tip = path[0]!;
  const next = path[1]!;
  drawArrowhead(tip, next, heads.from, size, target, color);
 }
 if (heads.to && heads.to !== "none") {
  const tip = path[path.length - 1]!;
  const prev = path[path.length - 2]!;
  drawArrowhead(tip, prev, heads.to, size, target, color);
 }
};

const drawArrowhead = (
 tip: Vec2,
 fromPoint: Vec2,
 style: Exclude<LinkArrowheads["from"], "none" | undefined>,
 size: number,
 target: RenderTarget,
 color: string,
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
 const half = size * 0.5;

 // Point `d` along the line from the tip; `o` adds a perpendicular offset.
 const along = (d: number): Vec2 => ({ x: tip.x + ux * d, y: tip.y + uy * d });
 const at = (d: number, o: number): Vec2 => ({
  x: tip.x + ux * d + px * o,
  y: tip.y + uy * d + py * o,
 });
 const fillShape = () => {
  target.setFill(color);
  target.fill();
  target.setFill(null);
  target.stroke();
 };

 switch (style) {
  // --- open line heads ---
  case "arrow":
  case "openArrow":
  case "roundedArrow": {
   const wing = style === "openArrow" ? size * 0.65 : half;
   const back = style === "openArrow" ? size * 1.1 : size;
   if (style === "roundedArrow") target.setLineCap("round");
   target.beginPath();
   target.moveTo(tip.x, tip.y);
   target.lineTo(tip.x + ux * back + px * wing, tip.y + uy * back + py * wing);
   target.moveTo(tip.x, tip.y);
   target.lineTo(tip.x + ux * back - px * wing, tip.y + uy * back - py * wing);
   target.stroke();
   if (style === "roundedArrow") target.setLineCap("butt");
   break;
  }
  case "arcArrow": {
   // Open V with a concave back (quadratic curve between the wings).
   const w1 = at(size, half);
   const w2 = at(size, -half);
   const ctrl = along(size * 0.45);
   target.beginPath();
   target.moveTo(w1.x, w1.y);
   target.lineTo(tip.x, tip.y);
   target.lineTo(w2.x, w2.y);
   target.quadraticCurveTo(ctrl.x, ctrl.y, w1.x, w1.y);
   target.stroke();
   break;
  }

  // --- triangles ---
  case "triangle": {
   // Outlined triangle (back-compat).
   target.beginPath();
   target.moveTo(tip.x, tip.y);
   target.lineTo(...xy(at(size, half)));
   target.lineTo(...xy(at(size, -half)));
   target.closePath();
   target.stroke();
   break;
  }
  case "filledArrow": {
   target.beginPath();
   target.moveTo(tip.x, tip.y);
   target.lineTo(...xy(at(size, half)));
   target.lineTo(...xy(at(size, -half)));
   target.closePath();
   fillShape();
   break;
  }

  // --- circles ---
  case "circle":
  case "filledCircle": {
   const r = half;
   const c = along(r);
   target.beginPath();
   target.ellipse(c.x, c.y, r, r);
   if (style === "filledCircle") fillShape();
   else target.stroke();
   break;
  }

  // --- rhombus / diamond ---
  case "diamond":
  case "rhombus":
  case "filledRhombus": {
   target.beginPath();
   target.moveTo(tip.x, tip.y);
   target.lineTo(...xy(at(size, half)));
   target.lineTo(...xy(along(size * 2)));
   target.lineTo(...xy(at(size, -half)));
   target.closePath();
   if (style === "filledRhombus") fillShape();
   else target.stroke();
   break;
  }

  // --- ERD crow's-foot notation ---
  // A "bar" is a perpendicular tick; "many" is the three-pronged foot;
  // "zero" prefixes a small circle. Distances are measured back from the
  // tip so the foot opens toward the connected entity.
  case "erdOne":
  case "erdOnlyOne":
  case "erdMany":
  case "erdOneOrMany":
  case "erdZeroOrOne":
  case "erdZeroOrMany": {
   const wantsMany = style === "erdMany" || style === "erdOneOrMany" || style === "erdZeroOrMany";
   const wantsZero = style === "erdZeroOrOne" || style === "erdZeroOrMany";
   const twoBars = style === "erdOnlyOne";
   const oneBar =
    style === "erdOne" || style === "erdOnlyOne" || style === "erdOneOrMany" || style === "erdZeroOrOne";
   // Crow's foot: three lines from a base point back to the tip's spread.
   if (wantsMany) {
    const base = along(size);
    target.beginPath();
    target.moveTo(base.x, base.y);
    target.lineTo(tip.x, tip.y);
    target.moveTo(base.x, base.y);
    target.lineTo(...xy(at(0, half)));
    target.moveTo(base.x, base.y);
    target.lineTo(...xy(at(0, -half)));
    target.stroke();
   }
   // Bars sit just behind the foot (or at the tip for pure one/only-one).
   const barBase = wantsMany ? size * 1.15 : size * 0.55;
   const drawBar = (d: number) => {
    target.beginPath();
    target.moveTo(...xy(at(d, half)));
    target.lineTo(...xy(at(d, -half)));
    target.stroke();
   };
   if (oneBar) drawBar(barBase);
   if (twoBars) drawBar(barBase + size * 0.4);
   if (wantsZero) {
    const r = half * 0.6;
    const c = along(size * (wantsMany ? 1.6 : 1.0) + r);
    target.beginPath();
    target.ellipse(c.x, c.y, r, r);
    target.stroke();
   }
   break;
  }
 }
};

// Tuple helper so `target.lineTo(...xy(p))` reads cleanly.
const xy = (p: Vec2): [number, number] => [p.x, p.y];

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
