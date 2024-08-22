import type { Vec2 } from "@oh-just-another/types";
import { getAnchorWorld } from "./anchors.js";
import type { Edge, EdgeEndpoint } from "./edge.js";
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
  return getAnchorWorld(shape, endpoint.anchor);
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

  // Orthogonal default: single elbow midway between endpoints. Picks the
  // larger axis (so an edge that's mostly horizontal goes horizontal-then-
  // vertical, and vice-versa). Replaceable with A* / obstacle-aware
  // routing later by setting `edge.waypoints` explicitly.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontalFirst = Math.abs(dx) >= Math.abs(dy);
  const mid: Vec2 = horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  return [from, mid, to];
};
