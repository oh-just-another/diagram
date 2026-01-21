import type { Vec2 } from "@oh-just-another/types";
import {
  CURVE_CATMULL_TENSION,
  CURVE_END_TANGENT_MAX_PX,
  CURVE_END_TANGENT_RATIO,
  CURVE_FLATTEN_SEGMENTS,
} from "./constants.js";

/**
 * Curved (bezier) link geometry — the single source of truth for the curve
 * shape so the renderer (draws cubic beziers) and hit-testing / bounds
 * (flatten the same curve) never disagree. A curved link bows away from the
 * straight polyline; testing clicks against the polyline would miss the
 * visible arc, so callers flatten the curve here instead.
 */

/** One cubic bezier segment: control points + end (start is implicit/prev). */
export interface BezierSegment {
  readonly c1: Vec2;
  readonly c2: Vec2;
  readonly to: Vec2;
}

/**
 * Cubic bezier from `from` to `to` that LEAVES `from` along `dirFrom` and
 * ENTERS `to` along `-dirTo` (both unit outward directions). This makes a
 * connector exit/enter perpendicular to an element's edge (flowchart look),
 * instead of always bowing to one fixed side. Control-arm length scales with
 * the endpoint distance (capped).
 */
export const cubicWithEndTangents = (
  from: Vec2,
  to: Vec2,
  dirFrom: Vec2,
  dirTo: Vec2,
): BezierSegment => {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const d = Math.min(dist * CURVE_END_TANGENT_RATIO, CURVE_END_TANGENT_MAX_PX);
  return {
    c1: { x: from.x + dirFrom.x * d, y: from.y + dirFrom.y * d },
    c2: { x: to.x + dirTo.x * d, y: to.y + dirTo.y * d },
    to,
  };
};

/**
 * Catmull-Rom spline through `pts` as cubic bezier segments. Each segment
 * Pi→Pi+1 uses tangents from the neighbouring points; endpoints duplicate
 * themselves. The curve passes through every point with no corners. Used for
 * a waypointed curve (the bends define the shape).
 */
export const catmullRomBeziers = (pts: readonly Vec2[]): BezierSegment[] => {
  const segs: BezierSegment[] = [];
  const k = CURVE_CATMULL_TENSION;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    segs.push({
      c1: { x: p1.x + (p2.x - p0.x) / k, y: p1.y + (p2.y - p0.y) / k },
      c2: { x: p2.x - (p3.x - p1.x) / k, y: p2.y - (p3.y - p1.y) / k },
      to: p2,
    });
  }
  return segs;
};

/** Point on a cubic bezier at parameter `t` (0..1). de Casteljau / Bernstein. */
export const cubicAt = (p0: Vec2, c1: Vec2, c2: Vec2, p1: Vec2, t: number): Vec2 => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
};

/**
 * Flatten a `start` + cubic-segment list into a dense point list (for
 * hit-testing / bounds). Includes `start` then `perSegment` samples per cubic.
 */
export const flattenSegments = (
  start: Vec2,
  segments: readonly BezierSegment[],
  perSegment = CURVE_FLATTEN_SEGMENTS,
): Vec2[] => {
  const out: Vec2[] = [start];
  let prev = start;
  for (const s of segments) {
    for (let i = 1; i <= perSegment; i++) {
      out.push(cubicAt(prev, s.c1, s.c2, s.to, i / perSegment));
    }
    prev = s.to;
  }
  return out;
};
