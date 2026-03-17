import type { Vec2 } from "@oh-just-another/types";

/**
 * Assert a loop-index lookup is present. `noUncheckedIndexedAccess`
 * widens every `arr[i]` to `T | undefined`; inside these geometry loops
 * the index is provably in range, so a miss is a real bug — fail loudly
 * instead of asserting non-null silently.
 */
const req = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error("polygon: index out of range");
  return v;
};

/**
 * Offset a closed polygon's vertices along the bisector at each corner.
 * Positive `distance` moves vertices inward (toward the centroid), negative
 * moves outward; both winding orders are handled by projecting the bisector
 * onto the toward-centroid vector and flipping the sign as needed.
 *
 * Each vertex moves `distance / cos(angle/2)` along the bisector of its two
 * adjacent edges (miter offset of the polygon's stroked outline).
 *
 * The bisector clamps at very sharp angles (cos < 1e-6) to avoid pixel-spike
 * artefacts. Concave polygons whose centroid lies outside the polygon can flip
 * inward/outward sign on isolated vertices. Polygons with fewer than 3 vertices
 * are returned unchanged.
 */
export const offsetClosedPath = (
  points: readonly Vec2[],
  distance: number,
): Vec2[] => {
  if (points.length < 3 || distance === 0) return points.map((p) => ({ x: p.x, y: p.y }));

  // Centroid as an interior reference, used to disambiguate inward / outward
  // direction regardless of vertex winding order.
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  const n = points.length;
  // Edge unit normals — rotate each edge vector 90°.
  const nx = new Array<number>(n);
  const ny = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = req(points[i]);
    const b = req(points[(i + 1) % n]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    nx[i] = -dy / len;
    ny[i] = dx / len;
  }

  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const n1x = req(nx[prev]);
    const n1y = req(ny[prev]);
    const n2x = req(nx[i]);
    const n2y = req(ny[i]);
    let bx = n1x + n2x;
    let by = n1y + n2y;
    const blen = Math.hypot(bx, by);
    if (blen < 1e-6) {
      // 180° turn — bisector ill-defined. Use one of the normals.
      bx = n1x;
      by = n1y;
    } else {
      bx /= blen;
      by /= blen;
    }
    // Inward = toward centroid; check the bisector's component along
    // (centroid - vertex).
    const vertex = req(points[i]);
    const towardCx = cx - vertex.x;
    const towardCy = cy - vertex.y;
    const dot = bx * towardCx + by * towardCy;
    const sign = dot >= 0 ? 1 : -1;
    const cos = bx * n1x + by * n1y;
    const miterLen = cos > 1e-6 ? distance / cos : distance;
    out.push({
      x: vertex.x + sign * bx * miterLen,
      y: vertex.y + sign * by * miterLen,
    });
  }
  return out;
};

/**
 * Twice the signed polygon area via the shoelace formula. Positive =
 * counter-clockwise in y-up coordinates / clockwise in y-down. Use the sign
 * to detect winding order; abs/2 = polygon area.
 */
export const signedArea = (points: readonly Vec2[]): number => {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = req(points[i]);
    const b = req(points[(i + 1) % points.length]);
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};
