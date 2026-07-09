import { req, type Vec2 } from "@oh-just-another/types";
import { bezier } from "@oh-just-another/math";
import { catmullRomBeziers } from "@oh-just-another/scene";

/** Any point that carries at least a world position. */
export interface SmoothablePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Resample a sparse polyline into a smooth, dense point list by fitting a
 * Catmull-Rom spline through the captured points (reusing `catmullRomBeziers`
 * from `@oh-just-another/scene` — one spline implementation for the whole repo)
 * and sampling `perSegment` sub-points per span.
 *
 * Freehand input (laser trail, brush stroke) is captured sparsely — one point
 * per pointer-move — so the raw polyline is angular. The `blend` callback
 * rebuilds each resampled point from its span endpoints and the interpolation
 * parameter `u`, so per-point payload beyond position (timestamp for the laser,
 * width for the brush) is carried across smoothly. Fewer than three points
 * can't form a curve, so they pass through unchanged.
 */
export const smoothStrokePoints = <P extends SmoothablePoint>(
  points: readonly P[],
  perSegment: number,
  blend: (a: P, b: P, pos: Vec2, u: number) => P,
): P[] => {
  if (points.length < 3) return points as P[];
  const segments = catmullRomBeziers(points.map((p) => ({ x: p.x, y: p.y })));
  const first = req(points[0]);
  const out: P[] = [first];
  let prev: Vec2 = { x: first.x, y: first.y };
  for (let i = 0; i < segments.length; i++) {
    const seg = req(segments[i]);
    const a = req(points[i]);
    const b = req(points[i + 1]);
    for (let j = 1; j <= perSegment; j++) {
      const u = j / perSegment;
      const p = bezier.cubicAt(prev, seg.c1, seg.c2, seg.to, u);
      out.push(blend(a, b, p, u));
    }
    prev = seg.to;
  }
  return out;
};
