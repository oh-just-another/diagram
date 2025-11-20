import type { Bounds, Vec2 } from "@oh-just-another/types";
import { ELBOW_DONGLE_GAP } from "./constants.js";
import type { Link, LinkEndpoint } from "./edge.js";
import { getLinkEndpointWorld } from "./edge-geometry.js";
import { elbowRoute } from "./elbow-router.js";
import {
  HEADING_DOWN,
  HEADING_LEFT,
  HEADING_RIGHT,
  HEADING_UP,
  headingForPoint,
  headingForPointFromElement,
  headingIsHorizontal,
  type Heading,
} from "./heading.js";
import { getElement } from "./queries.js";
import type { Scene } from "./scene.js";
import { getElementWorldBounds } from "./shape.js";

/**
 * Compute the orthogonal (elbow) route for a link: the corner points
 * between `from` and `to` (exclusive). This is what the editor stores on
 * `Link.routedPoints` and `getLinkPath` renders as `[from, ...points, to]`.
 *
 * standard model: each end exits perpendicular to its shape (a "dongle"
 * pushed out by `ELBOW_DONGLE_GAP` along the end's heading), the A* router
 * routes between the dongles around the two bound shapes, and the whole
 * chain is collapsed to corner points. The result is always axis-aligned.
 */
export const routeElbowLink = (scene: Scene, edge: Link): readonly Vec2[] => {
  const fromP = getLinkEndpointWorld(scene, edge.from);
  const toP = getLinkEndpointWorld(scene, edge.to);
  if (!fromP || !toP) return [];
  const from =
    edge.from.kind === "floating" ? getLinkEndpointWorld(scene, edge.from, toP) ?? fromP : fromP;
  const to =
    edge.to.kind === "floating" ? getLinkEndpointWorld(scene, edge.to, fromP) ?? toP : toP;
  if (from.x === to.x && from.y === to.y) return [];

  const a = endInfo(scene, edge.from, from, to);
  const b = endInfo(scene, edge.to, to, from);

  const dongleA: Vec2 = { x: from.x + a.heading.x * ELBOW_DONGLE_GAP, y: from.y + a.heading.y * ELBOW_DONGLE_GAP };
  const dongleB: Vec2 = { x: to.x + b.heading.x * ELBOW_DONGLE_GAP, y: to.y + b.heading.y * ELBOW_DONGLE_GAP };

  const obstacles: Bounds[] = [];
  if (a.obstacle) obstacles.push(a.obstacle);
  if (b.obstacle) obstacles.push(b.obstacle);

  const routed = elbowRoute(dongleA, dongleB, obstacles);
  const mid =
    routed && routed.length >= 2 ? routed : [dongleA, fallbackCorner(dongleA, dongleB, a.heading), dongleB];

  const full = collapseColinear([from, ...mid, to]);
  return full.slice(1, -1);
};

interface EndInfo {
  readonly heading: Heading;
  readonly obstacle: Bounds | null;
}

const namedHeading = (name: string): Heading | null => {
  switch (name) {
    case "top":
      return HEADING_UP;
    case "bottom":
      return HEADING_DOWN;
    case "left":
      return HEADING_LEFT;
    case "right":
      return HEADING_RIGHT;
    default:
      return null;
  }
};

/** Heading (exit side) + obstacle bbox for one endpoint. */
const endInfo = (scene: Scene, ep: LinkEndpoint, self: Vec2, other: Vec2): EndInfo => {
  if (ep.kind === "point") return { heading: headingForPoint(other, self), obstacle: null };
  const shape = getElement(scene, ep.elementId);
  if (!shape) return { heading: headingForPoint(other, self), obstacle: null };
  const obstacle = getElementWorldBounds(shape);
  if (ep.kind === "anchor" && ep.anchor.kind === "named") {
    const h = namedHeading(ep.anchor.name);
    if (h) return { heading: h, obstacle };
  }
  // floating aims at the partner; anchor(ratio/edge/absolute)/outline use the
  // side the resolved point sits on.
  const probe = ep.kind === "floating" ? other : self;
  return { heading: headingForPointFromElement(shape, probe), obstacle };
};

/** Single-bend L corner between two dongles (router-failure fallback). */
const fallbackCorner = (a: Vec2, b: Vec2, headingA: Heading): Vec2 =>
  headingIsHorizontal(headingA) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };

/** Drop colinear midpoints from an axis-aligned polyline (tolerant). */
const collapseColinear = (points: readonly Vec2[]): Vec2[] => {
  if (points.length <= 2) return [...points];
  const out: Vec2[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const eps = 1e-6;
    const horizontal = Math.abs(prev.y - cur.y) < eps && Math.abs(cur.y - next.y) < eps;
    const vertical = Math.abs(prev.x - cur.x) < eps && Math.abs(cur.x - next.x) < eps;
    const coincident = Math.abs(prev.x - cur.x) < eps && Math.abs(prev.y - cur.y) < eps;
    if (horizontal || vertical || coincident) continue;
    out.push(cur);
  }
  out.push(points[points.length - 1]!);
  return out;
};
