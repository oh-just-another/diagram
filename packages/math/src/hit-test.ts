import type { Bounds, Vec2 } from "@oh-just-another/types";
import { contains } from "./bounds.js";

/** Inclusive on the boundary. */
export const pointInRect = (p: Vec2, rect: Bounds): boolean => contains(rect, p);

/**
 * Even-odd ray casting. Polygon is treated as closed (last point to first).
 * Behavior on edges is implementation-defined and not guaranteed stable.
 */
export const pointInPolygon = (p: Vec2, polygon: readonly Vec2[]): boolean => {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const intersect =
      a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
};

/**
 * Squared distance from point `p` to the finite line segment a–b.
 * Use the squared form to compare with `tolerance * tolerance` and avoid sqrt.
 */
export const distanceToSegmentSq = (p: Vec2, a: Vec2, b: Vec2): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const px = p.x - a.x;
    const py = p.y - a.y;
    return px * px + py * py;
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const ddx = p.x - projX;
  const ddy = p.y - projY;
  return ddx * ddx + ddy * ddy;
};

export const distanceToSegment = (p: Vec2, a: Vec2, b: Vec2): number =>
  Math.sqrt(distanceToSegmentSq(p, a, b));

export const pointOnSegment = (p: Vec2, a: Vec2, b: Vec2, tolerance = 1): boolean =>
  distanceToSegmentSq(p, a, b) <= tolerance * tolerance;

export const pointOnPolyline = (p: Vec2, points: readonly Vec2[], tolerance = 1): boolean => {
  for (let i = 0; i < points.length - 1; i++) {
    if (pointOnSegment(p, points[i]!, points[i + 1]!, tolerance)) return true;
  }
  return false;
};
