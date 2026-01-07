import type { Bounds, Vec2 } from "@oh-just-another/types";

/**
 * A*-based elbow router (Manhattan / 90° segments that detour
 * around obstacle bboxes).
 *
 * Self-contained and pure: takes `from`, `to`, an `obstacles[]` list of world-
 * space bboxes (the source / target shapes typically), and returns
 * the polyline of axis-aligned bends — or `null` when no path
 * exists (degenerate: same point).
 *
 * Algorithm:
 *   1. Build a candidate-point set: from, to, and the four
 *      corners of each obstacle bbox inflated by `MARGIN` so
 *      the path runs *around* the box, not on its edge. Links
 *      whose two endpoints lie on the same axis (same x or same
 *      y) and don't cross any obstacle's interior become graph
 *      edges with cost = Manhattan distance.
 *   2. A* with Manhattan-distance heuristic from `from` to `to`.
 *   3. Post-process: collapse colinear waypoints so the returned
 *      path is the minimal bend list.
 *
 * The router is not a global optimum — A* on this sparse graph
 * gives a "good enough" detour without the O(N²) cost of a full
 * visibility graph.
 */

import {
  ELBOW_OBSTACLE_MARGIN,
  ELBOW_OBSTACLE_INTERIOR_EPSILON,
  ELBOW_BEND_PENALTY,
} from "./constants.js";

const MARGIN = ELBOW_OBSTACLE_MARGIN;
const INTERIOR_EPS = ELBOW_OBSTACLE_INTERIOR_EPSILON;
const BEND_PENALTY = ELBOW_BEND_PENALTY;

export interface ElbowRouteOptions {
  /** Pad obstacles by this many world units. Defaults to package constant. */
  readonly margin?: number;
  /**
   * Outward exit heading at `from` (the buffer direction). When set, the
   * router's FIRST move may not go in the opposite direction — so the route
   * never immediately reverses (retraces) the terminal buffer stub.
   */
  readonly startHeading?: Vec2;
  /**
   * Outward heading at `to` (the buffer direction). When set, the route may
   * not ARRIVE at the goal travelling in this direction — which would force
   * `bufB → to` to reverse it. Keeps the connector from doubling back at the
   * arrival end.
   */
  readonly endHeading?: Vec2;
  /**
   * The previous route's points (world). Used purely as a SECONDARY objective:
   * among paths of EQUAL cost, the one overlapping the previous route the most
   * wins, so the connector stays put across small drags (hysteresis — stops it
   * flickering between two equally-good topologies). Never changes edge cost
   * (so no negative edges / no infinite loop) and never beats a cheaper route.
   */
  readonly prefer?: readonly Vec2[];
}

/**
 * True when the axis-aligned step `a → b` lies on a segment of the previous
 * route `prefer` (same axis, same line, within extent). Drives the hysteresis
 * tie-break only — not the cost.
 */
const onPreferPath = (a: Vec2, b: Vec2, prefer: readonly Vec2[]): boolean => {
  if (prefer.length < 2) return false;
  const abH = Math.abs(a.y - b.y) < 1e-6;
  const abV = Math.abs(a.x - b.x) < 1e-6;
  for (let i = 1; i < prefer.length; i++) {
    const p = prefer[i - 1]!;
    const q = prefer[i]!;
    if (abH && Math.abs(p.y - q.y) < 1e-6 && Math.abs(a.y - p.y) < 1e-6) {
      if (Math.min(a.x, b.x) >= Math.min(p.x, q.x) - 1e-6 && Math.max(a.x, b.x) <= Math.max(p.x, q.x) + 1e-6) {
        return true;
      }
    }
    if (abV && Math.abs(p.x - q.x) < 1e-6 && Math.abs(a.x - p.x) < 1e-6) {
      if (Math.min(a.y, b.y) >= Math.min(p.y, q.y) - 1e-6 && Math.max(a.y, b.y) <= Math.max(p.y, q.y) + 1e-6) {
        return true;
      }
    }
  }
  return false;
};

export const elbowRoute = (
  from: Vec2,
  to: Vec2,
  obstacles: readonly Bounds[],
  options: ElbowRouteOptions = {},
): readonly Vec2[] | null => {
  if (eq(from, to)) return [from];

  const margin = options.margin ?? MARGIN;
  const inflated = obstacles.map((b) => inflate(b, margin));
  const startHeading = options.startHeading;
  const endHeading = options.endHeading;
  const prefer = options.prefer ?? [];

  // Candidate axes — every unique x and y value from endpoints + bbox
  // corners. The router walks the implicit grid those axes form.
  const xs = new Set<number>([from.x, to.x]);
  const ys = new Set<number>([from.y, to.y]);
  for (const b of inflated) {
    xs.add(b.x);
    xs.add(b.x + b.width);
    ys.add(b.y);
    ys.add(b.y + b.height);
  }
  const xList = [...xs].sort((a, b) => a - b);
  const yList = [...ys].sort((a, b) => a - b);

  // Each node is "(xIndex,yIndex)" packed into one string for Map keys.
  const nodeKey = (xi: number, yi: number): string => `${xi},${yi}`;
  const xOfIdx = (xi: number): number => xList[xi]!;
  const yOfIdx = (yi: number): number => yList[yi]!;

  const startXi = xList.indexOf(from.x);
  const startYi = yList.indexOf(from.y);
  const endXi = xList.indexOf(to.x);
  const endYi = yList.indexOf(to.y);

  // Manhattan heuristic — admissible on a grid with 90° edges.
  const h = (xi: number, yi: number): number =>
    Math.abs(xOfIdx(xi) - xOfIdx(endXi)) + Math.abs(yOfIdx(yi) - yOfIdx(endYi));

  interface NodeState {
    readonly key: string; // "xi,yi" (node identity)
    readonly skey: string; // "xi,yi,axis" (state identity incl. arrival axis)
    readonly xi: number;
    readonly yi: number;
    readonly axis: 0 | 1 | 2; // 0 = start (no incoming), 1 = horizontal, 2 = vertical
    readonly g: number; // cost from start
    readonly f: number; // g + h
    readonly stick: number; // # of steps overlapping the previous route (secondary, maximised)
  }

  const startNode = nodeKey(startXi, startYi);
  const open: NodeState[] = [
    { key: startNode, skey: `${startNode},0`, xi: startXi, yi: startYi, axis: 0, g: 0, f: h(startXi, startYi), stick: 0 },
  ];
  // cameFrom / gScore keyed by *state* (node + arrival axis) so a node can be
  // reached from both axes with different bend costs. stickScore is the
  // secondary objective (maximised only among equal-cost paths).
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[`${startNode},0`, 0]]);
  const stickScore = new Map<string, number>([[`${startNode},0`, 0]]);

  while (open.length > 0) {
    // Extract-min: cost first (f, then g), then prefer MORE overlap with the
    // previous route (hysteresis — sticky), then key for determinism.
    open.sort(
      (a, b) => a.f - b.f || a.g - b.g || b.stick - a.stick || (a.skey < b.skey ? -1 : 1),
    );
    const cur = open.shift()!;
    if (cur.xi === endXi && cur.yi === endYi) {
      return reconstructPath(cameFrom, cur.skey, xOfIdx, yOfIdx);
    }
    for (const next of neighbours(cur.xi, cur.yi, xList.length, yList.length)) {
      const fromPt: Vec2 = { x: xOfIdx(cur.xi), y: yOfIdx(cur.yi) };
      const toPt: Vec2 = { x: xOfIdx(next.xi), y: yOfIdx(next.yi) };
      if (segmentCrossesObstacle(fromPt, toPt, inflated)) continue;
      const stepX = Math.sign(toPt.x - fromPt.x);
      const stepY = Math.sign(toPt.y - fromPt.y);
      // Don't let the very first move reverse the start buffer (would retrace
      // the terminal stub) …
      if (
        cur.axis === 0 &&
        startHeading &&
        stepX === -Math.sign(startHeading.x) &&
        stepY === -Math.sign(startHeading.y)
      ) {
        continue;
      }
      // … and don't arrive at the goal travelling along the end-buffer heading
      // (would make bufB→to double back).
      if (
        next.xi === endXi &&
        next.yi === endYi &&
        endHeading &&
        stepX === Math.sign(endHeading.x) &&
        stepY === Math.sign(endHeading.y)
      ) {
        continue;
      }
      const stepAxis: 1 | 2 = next.xi !== cur.xi ? 1 : 2;
      const stepCost = Math.abs(fromPt.x - toPt.x) + Math.abs(fromPt.y - toPt.y);
      const turn = cur.axis !== 0 && cur.axis !== stepAxis ? BEND_PENALTY : 0;
      const tentative = cur.g + stepCost + turn; // cost — never discounted
      const tentativeStick = cur.stick + (onPreferPath(fromPt, toPt, prefer) ? 1 : 0);
      const nodeK = nodeKey(next.xi, next.yi);
      const stateK = `${nodeK},${stepAxis}`;
      const prev = gScore.get(stateK);
      // Accept a strictly cheaper path, OR an equal-cost path that overlaps the
      // previous route more (secondary objective). Equal-cost+more-stick
      // re-expansions are finite (stick strictly increases, bounded by path
      // length), so this can't loop.
      if (prev !== undefined) {
        if (tentative > prev) continue;
        if (tentative === prev && tentativeStick <= (stickScore.get(stateK) ?? 0)) continue;
      }
      gScore.set(stateK, tentative);
      stickScore.set(stateK, tentativeStick);
      cameFrom.set(stateK, cur.skey);
      open.push({
        key: nodeK,
        skey: stateK,
        xi: next.xi,
        yi: next.yi,
        axis: stepAxis,
        g: tentative,
        f: tentative + h(next.xi, next.yi),
        stick: tentativeStick,
      });
    }
  }

  // No path — caller falls back to a direct elbow.
  return null;
};

const eq = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;

const inflate = (b: Bounds, m: number): Bounds => ({
  x: b.x - m,
  y: b.y - m,
  width: b.width + 2 * m,
  height: b.height + 2 * m,
});

/**
 * Neighbours: the four orthogonal grid steps. We don't enumerate
 * every possible (xi, yi) target — only ±1 on one axis. That
 * yields a path that walks the axis-aligned grid one cell at a
 * time, and the colinear-collapse pass at the end strips the
 * intermediate waypoints.
 */
const neighbours = (
  xi: number,
  yi: number,
  xLen: number,
  yLen: number,
): readonly { xi: number; yi: number }[] => {
  const out: { xi: number; yi: number }[] = [];
  if (xi > 0) out.push({ xi: xi - 1, yi });
  if (xi < xLen - 1) out.push({ xi: xi + 1, yi });
  if (yi > 0) out.push({ xi, yi: yi - 1 });
  if (yi < yLen - 1) out.push({ xi, yi: yi + 1 });
  return out;
};

/**
 * Returns `true` when the axis-aligned segment `from → to` passes
 * through the *interior* of any obstacle. Link-on contact (the
 * segment runs along the bbox boundary) is allowed — that's the
 * whole point of the margin inflate.
 */
const segmentCrossesObstacle = (
  from: Vec2,
  to: Vec2,
  obstacles: readonly Bounds[],
): boolean => {
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);
  for (const o of obstacles) {
    const oMaxX = o.x + o.width;
    const oMaxY = o.y + o.height;
    // Bounding-box check first.
    if (maxX <= o.x || minX >= oMaxX || maxY <= o.y || minY >= oMaxY) continue;
    // Touching along an edge — allowed.
    if (
      maxX - o.x <= INTERIOR_EPS ||
      oMaxX - minX <= INTERIOR_EPS ||
      maxY - o.y <= INTERIOR_EPS ||
      oMaxY - minY <= INTERIOR_EPS
    ) {
      continue;
    }
    return true;
  }
  return false;
};

const reconstructPath = (
  cameFrom: Map<string, string>,
  endKey: string,
  xOfIdx: (xi: number) => number,
  yOfIdx: (yi: number) => number,
): readonly Vec2[] => {
  const path: Vec2[] = [];
  let cursor: string | undefined = endKey;
  while (cursor) {
    const [xi, yi] = cursor.split(",").map(Number);
    path.unshift({ x: xOfIdx(xi!), y: yOfIdx(yi!) });
    cursor = cameFrom.get(cursor);
  }
  return collapseColinear(path);
};

/**
 * Drop intermediate points on an axis-aligned polyline that lie
 * between their neighbours on the same axis. Three colinear points
 * → keep first and third.
 */
const collapseColinear = (points: readonly Vec2[]): readonly Vec2[] => {
  if (points.length <= 2) return points;
  const out: Vec2[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const horizontal = prev.y === cur.y && cur.y === next.y;
    const vertical = prev.x === cur.x && cur.x === next.x;
    if (horizontal || vertical) continue;
    out.push(cur);
  }
  out.push(points[points.length - 1]!);
  return out;
};
