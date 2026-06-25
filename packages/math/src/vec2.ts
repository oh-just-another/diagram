import type { Vec2 } from "@oh-just-another/types";

export const ZERO: Vec2 = Object.freeze({ x: 0, y: 0 });

export const of = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

export const mul = (a: Vec2, scalar: number): Vec2 => ({ x: a.x * scalar, y: a.y * scalar });

export const div = (a: Vec2, scalar: number): Vec2 => ({ x: a.x / scalar, y: a.y / scalar });

export const negate = (a: Vec2): Vec2 => ({ x: -a.x, y: -a.y });

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** 2D pseudo-cross (z component of the 3D cross product). */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

export const lengthSq = (a: Vec2): number => a.x * a.x + a.y * a.y;

export const length = (a: Vec2): number => Math.sqrt(lengthSq(a));

export const distanceSq = (a: Vec2, b: Vec2): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
};

export const distance = (a: Vec2, b: Vec2): number => Math.sqrt(distanceSq(a, b));

/** Returns ZERO when input is the zero vector. */
export const normalize = (a: Vec2): Vec2 => {
  const len = length(a);
  if (len === 0) return ZERO;
  return { x: a.x / len, y: a.y / len };
};

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Midpoint of two points. */
export const midpoint = (a: Vec2, b: Vec2): Vec2 => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/** Angle of the vector from the positive x-axis, in radians (-π, π]. */
export const angle = (a: Vec2): number => Math.atan2(a.y, a.x);

/** Rotate counterclockwise by `radians` around the origin. */
export const rotate = (a: Vec2, radians: number): Vec2 => {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};

/** Rotate `a` counterclockwise by `radians` around `pivot`. */
export const rotateAround = (a: Vec2, pivot: Vec2, radians: number): Vec2 => {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const dx = a.x - pivot.x;
  const dy = a.y - pivot.y;
  return { x: pivot.x + (dx * c - dy * s), y: pivot.y + (dx * s + dy * c) };
};

/** Counterclockwise 90° perpendicular. */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export const equals = (a: Vec2, b: Vec2, epsilon = 0): boolean => {
  if (epsilon === 0) return a.x === b.x && a.y === b.y;
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
};
