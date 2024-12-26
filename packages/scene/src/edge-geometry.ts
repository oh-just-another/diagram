import type { Vec2 } from "@oh-just-another/types";
import { getAnchorWorld } from "./anchors.js";
import type { Edge, EdgeEndpoint } from "./edge.js";
import { getOutlinePoint } from "./outline.js";
import type { Scene } from "./scene.js";
import { getShape } from "./queries.js";

/**
 * Resolve a single `EdgeEndpoint` to a world-space point.
 *
 * `kind: "point"` returns the stored position as-is. `kind: "anchor"`
 * looks up the referenced shape and resolves the anchor through
 * `getAnchorWorld` — picking up the shape's current position / rotation /
 * scale automatically.
 *
 * Returns `null` when an `anchor` endpoint references a shape id that
 * isn't (or no longer is) in the scene. Callers usually drop the edge
 * from the render pass in that case.
 */
export const getEdgeEndpointWorld = (scene: Scene, endpoint: EdgeEndpoint): Vec2 | null => {
  if (endpoint.kind === "point") return endpoint.position;
  const shape = getShape(scene, endpoint.shapeId);
  if (!shape) return null;
  if (endpoint.kind === "anchor") return getAnchorWorld(shape, endpoint.anchor);
  return getOutlinePoint(shape, endpoint.ratio);
};

/**
 * Produce the full polyline an edge draws, in world coordinates:
 * `[from, ...waypoints, to]` for `straight` routing; an axis-aligned
 * elbow for `orthogonal`; the two endpoints for `bezier` (control points
 * are derived by the renderer).
 *
 * Returns `null` if either endpoint can't be resolved. Honours an
 * explicit `edge.waypoints` array on every routing — hosts can pre-route
 * an edge with custom bends.
 */
export const getEdgePath = (scene: Scene, edge: Edge): readonly Vec2[] | null => {
  const from = getEdgeEndpointWorld(scene, edge.from);
  if (!from) return null;
  const to = getEdgeEndpointWorld(scene, edge.to);
  if (!to) return null;

  const explicitWaypoints = edge.waypoints ?? [];
  const routing = edge.routing ?? "straight";

  if (explicitWaypoints.length > 0 || routing === "straight" || routing === "bezier") {
    return [from, ...explicitWaypoints, to];
  }

  // Orthogonal — modern-style elbow with side-aware stubs.
  // When either endpoint is anchored to a named side (top / right /
  // bottom / left), we know which axis the edge should *exit* on,
  // so we add a small stub in that direction before bending toward
  // the other endpoint. Corner / center anchors and free `point`
  // endpoints fall back to the longest-axis-first heuristic.
  const fromDir = exitDirectionFor(edge.from);
  const toDir = exitDirectionFor(edge.to);
  const stub = Math.min(40, Math.max(8, Math.abs(to.x - from.x) / 4, Math.abs(to.y - from.y) / 4));

  if (fromDir || toDir) {
    const path: Vec2[] = [from];
    let cursorFrom = from;
    let cursorTo = to;
    if (fromDir) {
      cursorFrom = { x: from.x + fromDir.x * stub, y: from.y + fromDir.y * stub };
      path.push(cursorFrom);
    }
    let toStubPoint: Vec2 | null = null;
    if (toDir) {
      toStubPoint = { x: to.x + toDir.x * stub, y: to.y + toDir.y * stub };
    }
    // Bend between cursorFrom and (toStubPoint ?? to).
    const end = toStubPoint ?? cursorTo;
    const dx = end.x - cursorFrom.x;
    const dy = end.y - cursorFrom.y;
    // Pick bend axis based on the originating stub direction when
    // available — horizontal stub bends vertical first to align,
    // and vice-versa.
    const horizontalFirst = fromDir
      ? Math.abs(fromDir.x) > Math.abs(fromDir.y)
      : Math.abs(dx) >= Math.abs(dy);
    if (Math.abs(dx) > 0.5 && Math.abs(dy) > 0.5) {
      const bend: Vec2 = horizontalFirst
        ? { x: end.x, y: cursorFrom.y }
        : { x: cursorFrom.x, y: end.y };
      path.push(bend);
    }
    if (toStubPoint) path.push(toStubPoint);
    path.push(to);
    return path;
  }

  // Free-floating fallback — single elbow midway. Picks the larger
  // axis so an edge that's mostly horizontal goes horizontal-then-
  // vertical, and vice-versa.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontalFirst = Math.abs(dx) >= Math.abs(dy);
  const mid: Vec2 = horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  return [from, mid, to];
};

/**
 * Outward direction (unit vector) for an edge endpoint anchored to
 * a named side. Returns null when the endpoint has no clear
 * directional hint (centre / corner / free point / non-anchor).
 *
 * Used by the orthogonal routing to add a side-aware stub before
 * bending — matches the look of standard connectors.
 */
const exitDirectionFor = (endpoint: Edge["from"]): Vec2 | null => {
  if (endpoint.kind !== "anchor") return null;
  if (endpoint.anchor.kind !== "named") return null;
  switch (endpoint.anchor.name) {
    case "top":
      return { x: 0, y: -1 };
    case "right":
      return { x: 1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    default:
      // top-left / top-right / bottom-left / bottom-right / center / custom
      return null;
  }
};

/**
 * Distance from a point to a finite line segment in world coordinates.
 * Used by `findEdgeAt` for hit-testing.
 */
const distanceToSegment = (point: Vec2, a: Vec2, b: Vec2): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = point.x - a.x;
    const ey = point.y - a.y;
    return Math.hypot(ex, ey);
  }
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + dx * t;
  const cy = a.y + dy * t;
  return Math.hypot(point.x - cx, point.y - cy);
};

/**
 * Topmost edge under `worldPoint`, or `null` if none is within
 * `threshold` world-pixels of any segment. Iterates edges in layer
 * order; later layers (rendered on top) win when paths overlap.
 *
 * Bezier-routed edges are tested as if they were straight — the
 * approximation is conservative for selection and avoids sampling the
 * curve repeatedly. Acceptable since the curvature is mild for typical
 * flowchart-style connectors.
 */
export const findEdgeAt = (scene: Scene, worldPoint: Vec2, threshold = 5): Edge | null => {
  let best: { edge: Edge; distance: number } | null = null;
  for (const edge of scene.edges.values()) {
    const path = getEdgePath(scene, edge);
    if (!path) continue;
    let minDistance = Infinity;
    for (let i = 1; i < path.length; i++) {
      const d = distanceToSegment(worldPoint, path[i - 1]!, path[i]!);
      if (d < minDistance) minDistance = d;
    }
    if (minDistance > threshold) continue;
    // Layer ordering: a later edge in iteration order is rendered on top,
    // so it should win for ties.
    if (!best || minDistance <= best.distance) {
      best = { edge, distance: minDistance };
    }
  }
  return best?.edge ?? null;
};
