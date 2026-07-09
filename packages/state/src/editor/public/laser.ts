import { req, type Vec2 } from "@oh-just-another/types";
import { bezier } from "@oh-just-another/math";
import { catmullRomBeziers } from "@oh-just-another/scene";
import { LASER_SMOOTH_SEGMENTS, LASER_TRAIL_TTL_MS } from "../../constants.js";

/** One point of a laser trail — world position plus the time it was laid down. */
export interface LaserPoint {
  readonly x: number;
  readonly y: number;
  /** Birth timestamp (ms, `performance.now()` domain) — drives the fade. */
  readonly t: number;
}

/**
 * A single laser stroke: an ordered list of timestamped world points. Purely
 * ephemeral — never enters the scene or history. The overlay ramps each point's
 * opacity from 1 → 0 over {@link LASER_TRAIL_TTL_MS}; the editor prunes points
 * past that age so the trail vanishes shortly after the pointer stops.
 */
export interface LaserStroke {
  readonly points: LaserPoint[];
}

export const beginLaserStroke = (world: Vec2, now: number): LaserStroke => ({
  points: [{ x: world.x, y: world.y, t: now }],
});

export const extendLaserStroke = (stroke: LaserStroke, world: Vec2, now: number): void => {
  stroke.points.push({ x: world.x, y: world.y, t: now });
};

/**
 * Drop every point older than `ttl` (and any stroke left empty). Returns the
 * surviving strokes plus a `changed` flag; when nothing expired the SAME array
 * reference is returned so the render-overlay memo can skip a rebuild. The
 * returned array is fresh only when a prune actually happened.
 */
export const pruneLaserStrokes = (
  strokes: readonly LaserStroke[],
  now: number,
  ttl: number = LASER_TRAIL_TTL_MS,
): { readonly strokes: LaserStroke[]; readonly changed: boolean } => {
  let changed = false;
  const next: LaserStroke[] = [];
  for (const stroke of strokes) {
    const kept = stroke.points.filter((p) => now - p.t < ttl);
    if (kept.length === stroke.points.length) {
      next.push(stroke);
      continue;
    }
    changed = true;
    if (kept.length > 0) next.push({ points: kept });
  }
  return changed ? { strokes: next, changed } : { strokes: strokes as LaserStroke[], changed };
};

/**
 * Resample a laser trail into a smooth, dense point list for rendering. Points
 * are captured sparsely (one per pointer-move), so the raw polyline is angular;
 * this fits a Catmull-Rom curve through the captured points (reusing
 * `catmullRomBeziers` from `@oh-just-another/scene` — one implementation of the
 * spline for the whole repo) and samples `perSegment` sub-points per span.
 *
 * Each resampled point carries a birth timestamp linearly interpolated between
 * its span endpoints, so the overlay's per-segment TTL fade still melts the
 * trail tail-first exactly as it does for the raw points. Fewer than three
 * points can't form a curve, so they pass through unchanged.
 */
export const smoothLaserPoints = (
  points: readonly LaserPoint[],
  perSegment: number = LASER_SMOOTH_SEGMENTS,
): LaserPoint[] => {
  if (points.length < 3) return points as LaserPoint[];
  const segments = catmullRomBeziers(points.map((p) => ({ x: p.x, y: p.y })));
  const first = req(points[0]);
  const out: LaserPoint[] = [{ x: first.x, y: first.y, t: first.t }];
  let prev: Vec2 = first;
  for (let i = 0; i < segments.length; i++) {
    const seg = req(segments[i]);
    const t0 = req(points[i]).t;
    const t1 = req(points[i + 1]).t;
    for (let j = 1; j <= perSegment; j++) {
      const u = j / perSegment;
      const p = bezier.cubicAt(prev, seg.c1, seg.c2, seg.to, u);
      out.push({ x: p.x, y: p.y, t: t0 + (t1 - t0) * u });
    }
    prev = seg.to;
  }
  return out;
};
