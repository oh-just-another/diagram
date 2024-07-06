import type { Bounds, Vec2 } from "@oh-just-another/types";
import { fromPoints } from "./bounds";
import { distanceToSegmentSq } from "./hit-test";

/** Evaluate a quadratic Bezier at parameter t ∈ [0, 1]. */
export const quadraticAt = (p0: Vec2, p1: Vec2, p2: Vec2, t: number): Vec2 => {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
};

/** Evaluate a cubic Bezier at parameter t ∈ [0, 1]. */
export const cubicAt = (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 => {
  const u = 1 - t;
  const uu = u * u;
  const uuu = uu * u;
  const tt = t * t;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
};

/**
 * Tight AABB of a quadratic Bezier curve. Includes endpoints and any
 * extrema in t ∈ (0, 1).
 */
export const quadraticBounds = (p0: Vec2, p1: Vec2, p2: Vec2): Bounds => {
  const pts: Vec2[] = [p0, p2];
  for (const t of quadraticExtrema(p0.x, p1.x, p2.x)) pts.push(quadraticAt(p0, p1, p2, t));
  for (const t of quadraticExtrema(p0.y, p1.y, p2.y)) pts.push(quadraticAt(p0, p1, p2, t));
  return fromPoints(pts);
};

/** Tight AABB of a cubic Bezier (endpoints + derivative roots in (0, 1)). */
export const cubicBounds = (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): Bounds => {
  const pts: Vec2[] = [p0, p3];
  for (const t of cubicExtrema(p0.x, p1.x, p2.x, p3.x)) pts.push(cubicAt(p0, p1, p2, p3, t));
  for (const t of cubicExtrema(p0.y, p1.y, p2.y, p3.y)) pts.push(cubicAt(p0, p1, p2, p3, t));
  return fromPoints(pts);
};

/**
 * Approximate hit-test for a quadratic Bezier via polyline sampling.
 * `steps` controls accuracy vs. cost; the default suffices for editor-grade
 * picking at typical zoom levels.
 */
export const pointOnQuadratic = (
  p: Vec2,
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  tolerance = 1,
  steps = 32,
): boolean => {
  const tolSq = tolerance * tolerance;
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const cur = quadraticAt(p0, p1, p2, i / steps);
    if (distanceToSegmentSq(p, prev, cur) <= tolSq) return true;
    prev = cur;
  }
  return false;
};

/** Approximate hit-test for a cubic Bezier via polyline sampling. */
export const pointOnCubic = (
  p: Vec2,
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  tolerance = 1,
  steps = 64,
): boolean => {
  const tolSq = tolerance * tolerance;
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const cur = cubicAt(p0, p1, p2, p3, i / steps);
    if (distanceToSegmentSq(p, prev, cur) <= tolSq) return true;
    prev = cur;
  }
  return false;
};

/**
 * Sample the quadratic into `count + 1` points evenly in t. Useful for
 * converting to a polyline for renderers that lack curve primitives.
 */
export const flattenQuadratic = (p0: Vec2, p1: Vec2, p2: Vec2, count = 16): Vec2[] => {
  const out: Vec2[] = new Array<Vec2>(count + 1);
  for (let i = 0; i <= count; i++) out[i] = quadraticAt(p0, p1, p2, i / count);
  return out;
};

export const flattenCubic = (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, count = 32): Vec2[] => {
  const out: Vec2[] = new Array<Vec2>(count + 1);
  for (let i = 0; i <= count; i++) out[i] = cubicAt(p0, p1, p2, p3, i / count);
  return out;
};

// --- helpers ---

/**
 * Roots t ∈ (0, 1) of the derivative of a 1D quadratic Bezier (a, b, c).
 * Derivative: 2(1−t)(b−a) + 2t(c−b) = 0  ⇒  t = (a−b) / (a − 2b + c)
 */
const quadraticExtrema = (a: number, b: number, c: number): readonly number[] => {
  const denom = a - 2 * b + c;
  if (denom === 0) return [];
  const t = (a - b) / denom;
  return t > 0 && t < 1 ? [t] : [];
};

/**
 * Roots t ∈ (0, 1) of the derivative of a 1D cubic Bezier (a, b, c, d).
 * Derivative reduces to αt² + βt + γ where
 *   α = −a + 3b − 3c + d,  β = 2(a − 2b + c),  γ = b − a.
 */
const cubicExtrema = (a: number, b: number, c: number, d: number): readonly number[] => {
  const alpha = -a + 3 * b - 3 * c + d;
  const beta = 2 * (a - 2 * b + c);
  const gamma = b - a;
  const roots: number[] = [];
  if (Math.abs(alpha) < 1e-12) {
    if (Math.abs(beta) > 1e-12) {
      const t = -gamma / beta;
      if (t > 0 && t < 1) roots.push(t);
    }
    return roots;
  }
  const disc = beta * beta - 4 * alpha * gamma;
  if (disc < 0) return roots;
  const sq = Math.sqrt(disc);
  const t1 = (-beta + sq) / (2 * alpha);
  const t2 = (-beta - sq) / (2 * alpha);
  if (t1 > 0 && t1 < 1) roots.push(t1);
  if (t2 > 0 && t2 < 1) roots.push(t2);
  return roots;
};
