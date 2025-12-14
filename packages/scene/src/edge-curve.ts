import type { Vec2 } from "@oh-just-another/types";
import {
  CURVE_BULGE_MAX_PX,
  CURVE_BULGE_RATIO,
  CURVE_CATMULL_TENSION,
  CURVE_FLATTEN_SEGMENTS,
} from "./constants.js";

/**
 * Curved (bezier) link geometry — the single source of truth for the curve
 * shape so the renderer (draws cubic beziers) and hit-testing / bounds
 * (flatten the same curve) never disagree. A curved link bows out from the
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
 * A straight 2-point span has no intermediate geometry, so a spline through
 * it is just the chord. Insert a mid-point offset perpendicular to the chord
 * (capped) so "Curved" shows a visible arc even between axis-aligned shapes.
 * Returns the control polyline.
 */
export const bulgedChord = (from: Vec2, to: Vec2): readonly Vec2[] => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [from, to];
  const offset = Math.min(len * CURVE_BULGE_RATIO, CURVE_BULGE_MAX_PX);
  const nx = -dy / len; // unit normal (chord direction rotated +90°)
  const ny = dx / len;
  const mid = { x: (from.x + to.x) / 2 + nx * offset, y: (from.y + to.y) / 2 + ny * offset };
  return [from, mid, to];
};

/**
 * The control polyline a curved link's path resolves to: the path itself,
 * except a 2-point (no-waypoint) span gets the perpendicular bulge so it
 * isn't a straight line.
 */
export const curveControlPolyline = (path: readonly Vec2[]): readonly Vec2[] =>
  path.length === 2 ? bulgedChord(path[0]!, path[1]!) : path;

/**
 * Catmull-Rom spline through `pts` as cubic bezier segments. Each segment
 * Pi→Pi+1 uses tangents from the neighbouring points; endpoints duplicate
 * themselves. The curve passes through every point with no corners.
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

const cubicAt = (p0: Vec2, c1: Vec2, c2: Vec2, p1: Vec2, t: number): Vec2 => {
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
 * Flatten the curve through the control polyline `pts` into a dense point
 * list (for hit-testing / bounds). For < 3 points returns the points as-is.
 */
export const flattenCurve = (
  pts: readonly Vec2[],
  perSegment = CURVE_FLATTEN_SEGMENTS,
): Vec2[] => {
  if (pts.length < 3) return [...pts];
  const segs = catmullRomBeziers(pts);
  const out: Vec2[] = [pts[0]!];
  let prev = pts[0]!;
  for (const s of segs) {
    for (let i = 1; i <= perSegment; i++) {
      out.push(cubicAt(prev, s.c1, s.c2, s.to, i / perSegment));
    }
    prev = s.to;
  }
  return out;
};
