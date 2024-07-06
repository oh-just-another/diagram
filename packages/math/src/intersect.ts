import type { Vec2 } from "@oh-just-another/types";
import { cubicAt, quadraticAt } from "./bezier";

const EPS = 1e-12;

/**
 * Intersection of two infinite lines, each defined by two points.
 * Returns null when parallel or collinear.
 */
export const lineLine = (a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null => {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < EPS) return null;
  const dx = b1.x - a1.x;
  const dy = b1.y - a1.y;
  const t = (dx * dby - dy * dbx) / denom;
  return { x: a1.x + t * dax, y: a1.y + t * day };
};

/**
 * Intersection of two finite segments. Returns the intersection point or null
 * when none exists (parallel, collinear, or hits outside [0, 1] on either segment).
 */
export const segmentSegment = (a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null => {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < EPS) return null;
  const dx = b1.x - a1.x;
  const dy = b1.y - a1.y;
  const t = (dx * dby - dy * dbx) / denom;
  const u = (dx * day - dy * dax) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + t * dax, y: a1.y + t * day };
};

/**
 * Up-to-2 intersection points between a segment and a quadratic Bezier.
 * Algebraic solution: substitutes the Bezier into the line equation and
 * solves the resulting quadratic in t.
 */
export const segmentQuadratic = (
  a1: Vec2,
  a2: Vec2,
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
): readonly Vec2[] => {
  // Line normal n; for any point P, dot(n, P) + c is signed distance × |n|.
  const nx = a2.y - a1.y;
  const ny = -(a2.x - a1.x);
  const c = -(nx * a1.x + ny * a1.y);

  // Substitute B(t) into line equation, get αt² + βt + γ = 0.
  const A = nx * p0.x + ny * p0.y;
  const B = nx * p1.x + ny * p1.y;
  const C = nx * p2.x + ny * p2.y;
  const alpha = A - 2 * B + C;
  const beta = -2 * A + 2 * B;
  const gamma = A + c;

  const ts: number[] = [];
  if (Math.abs(alpha) < EPS) {
    if (Math.abs(beta) > EPS) {
      const t = -gamma / beta;
      if (t >= 0 && t <= 1) ts.push(t);
    }
  } else {
    const disc = beta * beta - 4 * alpha * gamma;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-beta + sq) / (2 * alpha);
      const t2 = (-beta - sq) / (2 * alpha);
      if (t1 >= 0 && t1 <= 1) ts.push(t1);
      if (t2 >= 0 && t2 <= 1) ts.push(t2);
    }
  }

  // Filter for points actually inside the finite segment.
  const out: Vec2[] = [];
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const lenSq = dax * dax + day * day;
  for (const t of ts) {
    const pt = quadraticAt(p0, p1, p2, t);
    if (lenSq === 0) {
      out.push(pt);
      continue;
    }
    const u = ((pt.x - a1.x) * dax + (pt.y - a1.y) * day) / lenSq;
    if (u >= 0 && u <= 1) out.push(pt);
  }
  return out;
};

/**
 * Intersection points between a segment and a cubic Bezier. Uses uniform
 * subdivision of the cubic into line segments, then segment-segment intersection.
 * `steps` trades accuracy for cost. Returns approximate points.
 */
export const segmentCubic = (
  a1: Vec2,
  a2: Vec2,
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  steps = 64,
): readonly Vec2[] => {
  const out: Vec2[] = [];
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const cur = cubicAt(p0, p1, p2, p3, i / steps);
    const pt = segmentSegment(a1, a2, prev, cur);
    if (pt !== null) out.push(pt);
    prev = cur;
  }
  return out;
};
