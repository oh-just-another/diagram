import type { Bounds, Vec2 } from "@oh-just-another/types";

export const EMPTY: Bounds = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

export const of = (x: number, y: number, width: number, height: number): Bounds => ({
  x,
  y,
  width,
  height,
});

export const fromPoints = (points: readonly Vec2[]): Bounds => {
  if (points.length === 0) return EMPTY;
  let minX = Infinity;
  let minY = Infinity;
  let maxXv = -Infinity;
  let maxYv = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxXv) maxXv = p.x;
    if (p.y > maxYv) maxYv = p.y;
  }
  return { x: minX, y: minY, width: maxXv - minX, height: maxYv - minY };
};

export const fromCenter = (center: Vec2, width: number, height: number): Bounds => ({
  x: center.x - width / 2,
  y: center.y - height / 2,
  width,
  height,
});

export const centerOf = (b: Bounds): Vec2 => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});

export const maxX = (b: Bounds): number => b.x + b.width;
export const maxY = (b: Bounds): number => b.y + b.height;

/** True if width or height is non-positive. */
export const isEmpty = (b: Bounds): boolean => b.width <= 0 || b.height <= 0;

export const union = (a: Bounds, b: Bounds): Bounds => {
  if (isEmpty(a)) return b;
  if (isEmpty(b)) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const xMax = Math.max(maxX(a), maxX(b));
  const yMax = Math.max(maxY(a), maxY(b));
  return { x, y, width: xMax - x, height: yMax - y };
};

/** Returns null if the intersection is empty. */
export const intersection = (a: Bounds, b: Bounds): Bounds | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const xMax = Math.min(maxX(a), maxX(b));
  const yMax = Math.min(maxY(a), maxY(b));
  if (xMax <= x || yMax <= y) return null;
  return { x, y, width: xMax - x, height: yMax - y };
};

export const intersects = (a: Bounds, b: Bounds): boolean => intersection(a, b) !== null;

export const contains = (b: Bounds, point: Vec2): boolean =>
  point.x >= b.x && point.x <= maxX(b) && point.y >= b.y && point.y <= maxY(b);

export const containsBounds = (outer: Bounds, inner: Bounds): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  maxX(inner) <= maxX(outer) &&
  maxY(inner) <= maxY(outer);

export const expand = (b: Bounds, padding: number): Bounds => ({
  x: b.x - padding,
  y: b.y - padding,
  width: b.width + 2 * padding,
  height: b.height + 2 * padding,
});

/** Flips negative width/height so that x/y is the top-left corner. */
export const normalize = (b: Bounds): Bounds => ({
  x: b.width < 0 ? b.x + b.width : b.x,
  y: b.height < 0 ? b.y + b.height : b.y,
  width: Math.abs(b.width),
  height: Math.abs(b.height),
});

export const equals = (a: Bounds, b: Bounds, epsilon = 0): boolean => {
  if (epsilon === 0) {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  }
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.width - b.width) <= epsilon &&
    Math.abs(a.height - b.height) <= epsilon
  );
};
