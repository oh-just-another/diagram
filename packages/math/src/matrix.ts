import type { Bounds, Transform, Vec2 } from "@oh-just-another/types";

export const IDENTITY: Transform = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

export const of = (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): Transform => ({ a, b, c, d, e, f });

export const translation = (tx: number, ty: number): Transform => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: tx,
  f: ty,
});

export const scaling = (sx: number, sy: number = sx): Transform => ({
  a: sx,
  b: 0,
  c: 0,
  d: sy,
  e: 0,
  f: 0,
});

export const rotation = (radians: number): Transform => {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
};

/**
 * Matrix product `a × b`. Composition is right-to-left: applying the result
 * to a point is equivalent to applying `b` first, then `a`.
 */
export const multiply = (a: Transform, b: Transform): Transform => ({
  a: a.a * b.a + a.c * b.b,
  b: a.b * b.a + a.d * b.b,
  c: a.a * b.c + a.c * b.d,
  d: a.b * b.c + a.d * b.d,
  e: a.a * b.e + a.c * b.f + a.e,
  f: a.b * b.e + a.d * b.f + a.f,
});

export const inverse = (t: Transform): Transform => {
  const det = t.a * t.d - t.b * t.c;
  if (det === 0) throw new Error("Cannot invert singular matrix");
  return {
    a: t.d / det,
    b: -t.b / det,
    c: -t.c / det,
    d: t.a / det,
    e: (t.c * t.f - t.d * t.e) / det,
    f: (t.b * t.e - t.a * t.f) / det,
  };
};

export const applyToPoint = (t: Transform, p: Vec2): Vec2 => ({
  x: t.a * p.x + t.c * p.y + t.e,
  y: t.b * p.x + t.d * p.y + t.f,
});

/**
 * Axis-aligned bounding box of `b` after applying `t`. The result is the AABB
 * of the four transformed corners — tighter approaches exist for pure rotations
 * but this is correct for any affine transform.
 */
export const applyToBounds = (t: Transform, b: Bounds): Bounds => {
  const p1 = applyToPoint(t, { x: b.x, y: b.y });
  const p2 = applyToPoint(t, { x: b.x + b.width, y: b.y });
  const p3 = applyToPoint(t, { x: b.x, y: b.y + b.height });
  const p4 = applyToPoint(t, { x: b.x + b.width, y: b.y + b.height });
  const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
  const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
  const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
  const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

export interface DecomposedTransform {
  readonly translation: Vec2;
  /** Radians, range (-π, π]. */
  readonly rotation: number;
  readonly scale: Vec2;
}

/**
 * Extracts translate / rotate / scale (TRS) from a transform. Assumes the matrix
 * encodes only translate/rotate/uniform-or-axis-aligned-scale (no skew). For matrices
 * with skew the decomposition is approximate.
 */
export const decompose = (t: Transform): DecomposedTransform => {
  const sx = Math.sqrt(t.a * t.a + t.b * t.b);
  const sy = Math.sqrt(t.c * t.c + t.d * t.d);
  const det = t.a * t.d - t.b * t.c;
  const sySigned = det < 0 ? -sy : sy;
  return {
    translation: { x: t.e, y: t.f },
    rotation: Math.atan2(t.b, t.a),
    scale: { x: sx, y: sySigned },
  };
};

export const equals = (a: Transform, b: Transform, epsilon = 0): boolean => {
  const fields: readonly (keyof Transform)[] = ["a", "b", "c", "d", "e", "f"];
  if (epsilon === 0) return fields.every((k) => a[k] === b[k]);
  return fields.every((k) => Math.abs(a[k] - b[k]) <= epsilon);
};
