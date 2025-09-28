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
} from "./constants.js";

const MARGIN = ELBOW_OBSTACLE_MARGIN;
const INTERIOR_EPS = ELBOW_OBSTACLE_INTERIOR_EPSILON;

export interface ElbowRouteOptions {
  /** Pad obstacles by this many world units. Defaults to package constant. */
  readonly margin?: number;
}

export const elbowRoute = (
  from: Vec2,
  to: Vec2,
  obstacles: readonly Bounds[],
  options: ElbowRouteOptions = {},
): readonly Vec2[] | null => {
  if (eq(from, to)) return [from];

  const margin = options.margin ?? MARGIN;
  const inflated = obstacles.map((b) => inflate(b, margin));

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
    readonly key: string;
    readonly xi: number;
    readonly yi: number;
    readonly g: number; // cost from start
    readonly f: number; // g + h
  }

  const open: NodeState[] = [
    { key: nodeKey(startXi, startYi), xi: startXi, yi: startYi, g: 0, f: h(startXi, startYi) },
  ];
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[nodeKey(startXi, startYi), 0]]);

  while (open.length > 0) {
    // Linear-scan extract-min — fine for the small grids we get
    // (≤ 12 nodes for one source + one target).
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    if (cur.xi === endXi && cur.yi === endYi) {
      return reconstructPath(cameFrom, cur.key, xOfIdx, yOfIdx);
    }
    for (const next of neighbours(cur.xi, cur.yi, xList.length, yList.length)) {
      const fromPt: Vec2 = { x: xOfIdx(cur.xi), y: yOfIdx(cur.yi) };
      const toPt: Vec2 = { x: xOfIdx(next.xi), y: yOfIdx(next.yi) };
      if (segmentCrossesObstacle(fromPt, toPt, inflated)) continue;
      const stepCost = Math.abs(fromPt.x - toPt.x) + Math.abs(fromPt.y - toPt.y);
      const tentative = cur.g + stepCost;
      const k = nodeKey(next.xi, next.yi);
      const prev = gScore.get(k);
      if (prev !== undefined && tentative >= prev) continue;
      gScore.set(k, tentative);
      cameFrom.set(k, cur.key);
      open.push({ key: k, xi: next.xi, yi: next.yi, g: tentative, f: tentative + h(next.xi, next.yi) });
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
