import type { Bounds, ElementId, Vec2 } from "@oh-just-another/types";
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
  let full = routeBetween(from, to, a, b);
  full = applyFixedSegments(full, edge.fixedSegments);
  return full.slice(1, -1);
};

/**
 * Live elbow path for a connector being drawn (preview): full
 * `[from, ...corners, to]`. `fromElementId` / `toElementId` give each end
 * its exit heading + obstacle (null for a free end — heading then points at
 * the other end). Mirrors {@link routeElbowLink} so the dashed preview
 * matches the committed elbow.
 */
export const routeElbowPreview = (
  scene: Scene,
  fromElementId: ElementId | null,
  from: Vec2,
  toElementId: ElementId | null,
  to: Vec2,
): readonly Vec2[] => {
  if (from.x === to.x && from.y === to.y) return [from, to];
  const a = pointEndInfo(scene, fromElementId, from, to);
  const b = pointEndInfo(scene, toElementId, to, from);
  return routeBetween(from, to, a, b);
};

/** Core router shared by link + preview: dongles → A* → collapsed full path. */
const routeBetween = (from: Vec2, to: Vec2, a: EndInfo, b: EndInfo): Vec2[] => {
  const dongleA: Vec2 = {
    x: from.x + a.heading.x * ELBOW_DONGLE_GAP,
    y: from.y + a.heading.y * ELBOW_DONGLE_GAP,
  };
  const dongleB: Vec2 = {
    x: to.x + b.heading.x * ELBOW_DONGLE_GAP,
    y: to.y + b.heading.y * ELBOW_DONGLE_GAP,
  };
  const obstacles: Bounds[] = [];
  if (a.obstacle) obstacles.push(a.obstacle);
  if (b.obstacle) obstacles.push(b.obstacle);
  const routed = elbowRoute(dongleA, dongleB, obstacles);
  const mid =
    routed && routed.length >= 2 ? routed : [dongleA, fallbackCorner(dongleA, dongleB, a.heading), dongleB];
  return collapseColinear([from, ...mid, to]);
};

/** EndInfo for a raw point that may sit on a shape (preview). */
const pointEndInfo = (scene: Scene, elId: ElementId | null, self: Vec2, other: Vec2): EndInfo => {
  if (!elId) return { heading: headingForPoint(other, self), obstacle: null };
  const shape = getElement(scene, elId);
  if (!shape) return { heading: headingForPoint(other, self), obstacle: null };
  return { heading: headingForPointFromElement(shape, self), obstacle: getElementWorldBounds(shape) };
};

/**
 * Pin user-dragged interior segments to their stored perpendicular
 * coordinate. Moving a segment along its perpendicular only stretches the
 * (perpendicular) neighbour segments — orientation is preserved — so this is
 * a direct coordinate override, no propagation needed. Terminal segments
 * (touching `from`/`to`) are skipped: their endpoint can't move.
 */
const applyFixedSegments = (full: Vec2[], fixed: Link["fixedSegments"]): Vec2[] => {
  if (!fixed || fixed.length === 0) return full;
  let out = full.map((p) => ({ ...p }));
  for (const pin of fixed) {
    const lastSeg = out.length - 2; // index of the last segment's start point
    // Re-identify the pinned segment in the fresh route: the interior segment
    // with the same axis whose centre is closest to the stored `at`. Robust to
    // index / topology changes that a raw index can't survive.
    let bestK = -1;
    let bestD = Infinity;
    for (let k = 1; k < lastSeg; k++) {
      const a = out[k]!;
      const b = out[k + 1]!;
      const isH = Math.abs(a.y - b.y) < 1e-6;
      const isV = Math.abs(a.x - b.x) < 1e-6;
      if ((pin.axis === "h") !== isH || (pin.axis === "v") !== isV) continue;
      const centre = pin.axis === "h" ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
      const d = Math.abs(centre - pin.at);
      if (d < bestD) {
        bestD = d;
        bestK = k;
      }
    }
    if (bestK >= 0) {
      // Slide an existing interior segment to its pinned coordinate.
      const a = out[bestK]!;
      const b = out[bestK + 1]!;
      if (pin.axis === "h") {
        a.y = pin.pos;
        b.y = pin.pos;
      } else {
        a.x = pin.pos;
        b.x = pin.pos;
      }
      continue;
    }
    // No matching interior segment. On a straight (2-point) route, the user
    // grabbed the whole connector to bend it → insert a "staple" jog so a
    // segment of the pinned axis sits at `pos` (terminal-drag, modern-style).
    if (out.length === 2) {
      const p0 = out[0]!;
      const p1 = out[1]!;
      out =
        pin.axis === "h"
          ? [p0, { x: p0.x, y: pin.pos }, { x: p1.x, y: pin.pos }, p1]
          : [p0, { x: pin.pos, y: p0.y }, { x: pin.pos, y: p1.y }, p1];
    }
    // Multi-segment route with no interior match → pin lapses (interior
    // segments remain the editable handles).
  }
  return collapseColinear(out);
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
