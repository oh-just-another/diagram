import { hitTest } from "@oh-just-another/math";
import { req } from "../../helpers/util.js";
import type { BrushElement, BrushPoint } from "@oh-just-another/scene";
import type { Vec2 } from "@oh-just-another/types";
import {
  ERASE_COVERAGE_SAMPLE_FRACTION,
  ERASE_COVERAGE_MIN_SAMPLE_STEP,
  ERASE_BOUNDARY_BISECT_ITERS,
} from "../../constants.js";

/**
 * A covered (erased) span along a brush polyline, in ARC-LENGTH units:
 * `[start, end]` with `start <= end`, both in `[0, total]`. Working in arc length
 * (not vertex index) is what makes the stroke-eraser resolution-independent — a
 * big disc grazing a sparsely-sampled stroke still removes the span it covers.
 */
export type Interval = readonly [number, number];

const EPS = 1e-6;

/** Arc-length parametrisation of a brush polyline (lengths in world units). */
export interface BrushArc {
  readonly pts: readonly BrushPoint[];
  readonly position: Vec2;
  /** `cum[i]` = arc length from point 0 to point i; `cum[n-1]` = `total`. */
  readonly cum: readonly number[];
  readonly total: number;
}

/** Precompute the arc-length parametrisation of `brush` (O(points)). */
export const brushArc = (brush: BrushElement): BrushArc => {
  const pts = brush.points;
  const n = pts.length;
  const cum: number[] = new Array<number>(Math.max(1, n)).fill(0);
  let acc = 0;
  for (let i = 1; i < n; i++) {
    const a = req(pts[i - 1]);
    const b = req(pts[i]);
    acc += Math.hypot(b.x - a.x, b.y - a.y);
    cum[i] = acc;
  }
  return { pts, position: brush.position, cum, total: acc };
};

/** Local (position-relative) brush point at arc length `L`, clamped to `[0,total]`. */
export const localPointAtArc = (arc: BrushArc, L: number): BrushPoint => {
  const { pts, cum, total } = arc;
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0, width: 0 };
  if (n === 1 || L <= 0) return { ...req(pts[0]) };
  if (L >= total) return { ...req(pts[n - 1]) };
  // Binary-search the segment [lo, lo+1] whose arc span contains L.
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (req(cum[mid]) <= L) lo = mid;
    else hi = mid;
  }
  const a = req(pts[lo]);
  const b = req(pts[lo + 1]);
  const segLen = req(cum[lo + 1]) - req(cum[lo]);
  const t = segLen > 0 ? (L - req(cum[lo])) / segLen : 0;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    width: a.width + (b.width - a.width) * t,
  };
};

const worldDistSqAtArc = (arc: BrushArc, L: number, a: Vec2, b: Vec2): number => {
  const p = localPointAtArc(arc, L);
  return hitTest.distanceToSegmentSq({ x: arc.position.x + p.x, y: arc.position.y + p.y }, a, b);
};

/**
 * Refine a covered-span endpoint by bisecting between an UNCOVERED arc position
 * (`loL`) and a COVERED one (`hiL`) until it lands on the eraser ring (distance =
 * radius). Returns the covered-side estimate, so the surviving fragment stops
 * exactly at the ring rather than at the nearest sample. See
 * {@link ERASE_BOUNDARY_BISECT_ITERS}.
 */
const bisectBoundary = (
  arc: BrushArc,
  loL: number,
  hiL: number,
  a: Vec2,
  b: Vec2,
  radiusSq: number,
): number => {
  let lo = loL;
  let hi = hiL;
  for (let i = 0; i < ERASE_BOUNDARY_BISECT_ITERS; i++) {
    const mid = (lo + hi) / 2;
    if (worldDistSqAtArc(arc, mid, a, b) <= radiusSq) hi = mid;
    else lo = mid;
  }
  return hi;
};

/**
 * Arc-length spans of `arc` covered by the eraser SEGMENT `a → b` at `radius` —
 * i.e. where the brush polyline lies within `radius` of the swept disc. Samples
 * each brush segment whose bounding box (grown by `radius`) meets the eraser
 * segment's, at {@link ERASE_COVERAGE_SAMPLE_FRACTION} × radius spacing, and pins
 * each span's endpoints to the ring by bisection. Returns merged intervals (may
 * be empty). A single-point brush yields `[[0,0]]` when the point is within reach.
 */
export const coveredArcAgainstSegment = (
  arc: BrushArc,
  a: Vec2,
  b: Vec2,
  radius: number,
): Interval[] => {
  const { pts, cum, total } = arc;
  const n = pts.length;
  if (n === 0) return [];
  const radiusSq = radius * radius;
  if (total === 0) {
    const p = req(pts[0]);
    const d = hitTest.distanceToSegmentSq(
      { x: arc.position.x + p.x, y: arc.position.y + p.y },
      a,
      b,
    );
    return d <= radiusSq ? [[0, 0]] : [];
  }
  const exMinX = Math.min(a.x, b.x) - radius;
  const exMaxX = Math.max(a.x, b.x) + radius;
  const exMinY = Math.min(a.y, b.y) - radius;
  const exMaxY = Math.max(a.y, b.y) + radius;
  const px = arc.position.x;
  const py = arc.position.y;
  const step = Math.max(ERASE_COVERAGE_MIN_SAMPLE_STEP, radius * ERASE_COVERAGE_SAMPLE_FRACTION);
  const raw: Interval[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = req(pts[i]);
    const p1 = req(pts[i + 1]);
    // Reject segments whose (radius-grown) bbox misses the eraser segment's.
    if (
      Math.max(p0.x, p1.x) + px < exMinX ||
      Math.min(p0.x, p1.x) + px > exMaxX ||
      Math.max(p0.y, p1.y) + py < exMinY ||
      Math.min(p0.y, p1.y) + py > exMaxY
    ) {
      continue;
    }
    const segStart = req(cum[i]);
    const segLen = req(cum[i + 1]) - segStart;
    if (segLen <= 0) continue;
    const steps = Math.max(1, Math.ceil(segLen / step));
    let runStart = -1;
    let prevL = segStart;
    for (let k = 0; k <= steps; k++) {
      const L = k === steps ? segStart + segLen : segStart + (segLen * k) / steps;
      const cov = worldDistSqAtArc(arc, L, a, b) <= radiusSq;
      if (cov && runStart < 0) {
        runStart = k === 0 ? L : bisectBoundary(arc, prevL, L, a, b, radiusSq);
      } else if (!cov && runStart >= 0) {
        raw.push([runStart, bisectBoundary(arc, L, prevL, a, b, radiusSq)]);
        runStart = -1;
      }
      prevL = L;
    }
    if (runStart >= 0) raw.push([runStart, segStart + segLen]);
  }
  return mergeIntervals(raw);
};

/** Merge overlapping / touching intervals into a sorted, disjoint set. */
export const mergeIntervals = (intervals: readonly Interval[]): Interval[] => {
  if (intervals.length <= 1) return intervals.map((iv): Interval => [iv[0], iv[1]]);
  const sorted = [...intervals].sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1] + EPS) {
      if (e > last[1]) last[1] = e;
    } else {
      out.push([s, e]);
    }
  }
  return out;
};

/** Total covered arc length across `intervals` (assumed disjoint). */
export const coveredLength = (intervals: readonly Interval[]): number =>
  intervals.reduce((sum, [s, e]) => sum + (e - s), 0);

/** The KEPT arc spans: `[0, total]` minus the covered `intervals`. */
export const complementIntervals = (covered: readonly Interval[], total: number): Interval[] => {
  const merged = mergeIntervals(covered);
  const kept: Interval[] = [];
  let cursor = 0;
  for (const [s, e] of merged) {
    if (s > cursor + EPS) kept.push([cursor, s]);
    if (e > cursor) cursor = e;
  }
  if (total > cursor + EPS) kept.push([cursor, total]);
  return kept;
};
