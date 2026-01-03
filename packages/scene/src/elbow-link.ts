import type { Bounds, ElementId, Vec2 } from "@oh-just-another/types";
import { ELBOW_MIN_SEGMENT, ELBOW_TERMINAL_BUFFER } from "./constants.js";
import type { Link, LinkEndpoint } from "./edge.js";
import { getLinkEndpointWorld } from "./edge-geometry.js";
import { elbowRoute } from "./elbow-router.js";
import {
  HEADING_DOWN,
  HEADING_LEFT,
  HEADING_RIGHT,
  HEADING_UP,
  headingForEdgePoint,
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
 * pushed out by `ELBOW_TERMINAL_BUFFER` along the end's heading), the A* router
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
  // The route is structured as a fixed outward BUFFER stub at each end plus a
  // movable middle between the two stub joints (bufA / bufB). `routeMiddle`
  // returns [bufA, ...corners..., bufB]; the buffers themselves are the
  // from→bufA / bufB→to segments that `getLinkPath` adds when it wraps
  // routedPoints with from/to — they're never collapsed, so an aligned elbow
  // still has 3 segments (buffer + movable + buffer) and reads as one line.
  let middle = routeMiddle(from, to, a, b);
  middle = applyFixedSegments(middle, edge.fixedSegments);
  // When the two shapes are closer than 2×buffer along the exit axis, the two
  // buffer levels don't meet and the route makes a tiny reverse "kink" right
  // after a buffer. Trim that overshoot (shorten the buffer to the turn) so
  // the connector stays clean instead of leaving an un-roundable jog.
  let full = trimBufferOvershoot([from, ...middle, to]);
  full = straightenShortJogs(full, ELBOW_MIN_SEGMENT);
  return full.slice(1, -1);
};

/**
 * Straighten short zigzag "jogs": a step segment shorter than `minStep` that
 * sits between two parallel runs (an S) can't be rounded and reads as a sharp
 * zigzag. Snap the second run onto the first run's level (dropping the step) so
 * the two runs merge into one straight segment — but only when that keeps the
 * segment AFTER the jog pointing the same way (so we never flip a terminal
 * buffer inward). Loops until no collapsible jog remains.
 */
const straightenShortJogs = (path: readonly Vec2[], minStep: number): Vec2[] => {
  let pts = [...path];
  let guard = 0;
  for (;;) {
    if (guard++ > 64) break;
    let collapsed = false;
    for (let i = 1; i + 2 < pts.length; i++) {
      const A = pts[i - 1]!;
      const B = pts[i]!;
      const C = pts[i + 1]!;
      const D = pts[i + 2]!;
      const stepLen = Math.hypot(C.x - B.x, C.y - B.y);
      if (stepLen < 1e-6 || stepLen >= minStep) continue;
      const stepVert = Math.abs(B.x - C.x) < 1e-6 && Math.abs(B.y - C.y) > 1e-6;
      const stepHorz = Math.abs(B.y - C.y) < 1e-6 && Math.abs(B.x - C.x) > 1e-6;
      if (!stepVert && !stepHorz) continue;
      // Flanking runs must be perpendicular to the step (i.e. parallel).
      const abPerp = stepVert
        ? Math.abs(A.y - B.y) < 1e-6 && Math.abs(A.x - B.x) > 1e-6
        : Math.abs(A.x - B.x) < 1e-6 && Math.abs(A.y - B.y) > 1e-6;
      const cdPerp = stepVert
        ? Math.abs(C.y - D.y) < 1e-6 && Math.abs(C.x - D.x) > 1e-6
        : Math.abs(C.x - D.x) < 1e-6 && Math.abs(C.y - D.y) > 1e-6;
      if (!abPerp || !cdPerp) continue;
      // Snap run2 (C,D) onto run1's level (B). D' keeps D's free coordinate
      // (x for a vertical step, y for a horizontal one).
      const dPrime = stepVert ? { x: D.x, y: B.y } : { x: B.x, y: D.y };
      // Only collapse a jog that's a SPURIOUS zigzag — one where moving D keeps
      // the whole path orthogonal. The point after D must share D's preserved
      // coordinate (so D'→after stays axis-aligned); and D must not be the
      // terminal endpoint (we can't move a bound point). This rejects a REAL
      // offset step needed to reach an offset shape (which would become a
      // diagonal), keeping only the buffer-mismatch zigzags.
      const after = pts[i + 3];
      if (!after) continue;
      const stillAligned = stepVert
        ? Math.abs(after.x - D.x) < 1e-6
        : Math.abs(after.y - D.y) < 1e-6;
      if (!stillAligned) continue;
      // Also don't flip the segment after D.
      const oldDir = stepVert ? Math.sign(after.y - D.y) : Math.sign(after.x - D.x);
      const newDir = stepVert ? Math.sign(after.y - dPrime.y) : Math.sign(after.x - dPrime.x);
      if (oldDir !== 0 && newDir !== 0 && oldDir !== newDir) continue;
      pts[i + 2] = dPrime;
      pts.splice(i, 2); // drop B and C; A→D' is now one straight run
      collapsed = true;
      break;
    }
    if (!collapsed) break;
  }
  return pts;
};

/**
 * Remove a tiny reverse "kink" at a terminal buffer: when the first move after
 * the from-buffer (or last move before the to-buffer) reverses it by a small
 * amount that still stays OUTWARD of the endpoint, the buffer simply
 * overshot the turn — drop the buffer joint so the buffer shortens to the turn
 * level. Large reversals that cross back PAST the endpoint (inherent
 * opposite-anchor folds) are left untouched.
 */
const trimBufferOvershoot = (full: readonly Vec2[]): Vec2[] => {
  let out = [...full];
  // Start end: [f, bufJoint, next, ...]
  if (out.length >= 3) {
    const f = out[0]!;
    const j = out[1]!;
    const n = out[2]!;
    if (overshoots(f, j, n)) out = [f, n, ...out.slice(3)];
  }
  // End end: [..., prev, bufJoint, t]
  if (out.length >= 3) {
    const t = out[out.length - 1]!;
    const j = out[out.length - 2]!;
    const p = out[out.length - 3]!;
    if (overshoots(t, j, p)) out = [...out.slice(0, -3), p, t];
  }
  return out;
};

/**
 * True when `end → joint` (a buffer) is reversed by `joint → next` along the
 * same axis, but `next` still sits on the OUTWARD side of `end` — i.e. the
 * buffer merely overshot the turn and the joint can be dropped (buffer →
 * `end → next`, same direction, just shorter).
 */
const overshoots = (end: Vec2, joint: Vec2, next: Vec2): boolean => {
  const vert = Math.abs(end.x - joint.x) < 1e-6 && Math.abs(end.y - joint.y) > 1e-6;
  const horz = Math.abs(end.y - joint.y) < 1e-6 && Math.abs(end.x - joint.x) > 1e-6;
  if (vert && Math.abs(joint.x - next.x) < 1e-6) {
    const dir = Math.sign(joint.y - end.y); // buffer direction
    return Math.sign(next.y - joint.y) === -dir && Math.sign(next.y - end.y) === dir;
  }
  if (horz && Math.abs(joint.y - next.y) < 1e-6) {
    const dir = Math.sign(joint.x - end.x);
    return Math.sign(next.x - joint.x) === -dir && Math.sign(next.x - end.x) === dir;
  }
  return false;
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
  return [from, ...routeMiddle(from, to, a, b), to];
};

/**
 * Movable middle of an elbow: the path between the two outward BUFFER stub
 * joints (`bufA` = from pushed out along its heading, `bufB` = to pushed out
 * along its). Returns `[bufA, ...corners..., bufB]`. The from→bufA / bufB→to
 * stubs are added by the caller (getLinkPath / preview) and are the fixed,
 * non-movable terminal segments. On very short links the buffer is clamped so
 * the two stubs don't overrun each other.
 */
const routeMiddle = (from: Vec2, to: Vec2, a: EndInfo, b: EndInfo): Vec2[] => {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  let buf = Math.min(ELBOW_TERMINAL_BUFFER, dist * 0.45); // clamp on short links
  // When both buffers run along the SAME axis pointing TOWARD each other (e.g.
  // a bottom anchor above a top anchor), they share the gap between the shapes.
  // Clamp to half that gap so the two stubs meet symmetrically at the midpoint
  // instead of one staying full while the other shrinks to near-zero (which
  // also removes the tiny mid-kink). Keeps both buffers equal.
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (a.heading.y !== 0 && b.heading.y === -a.heading.y && Math.sign(a.heading.y) === Math.sign(dy)) {
    buf = Math.min(buf, Math.abs(dy) / 2);
  }
  if (a.heading.x !== 0 && b.heading.x === -a.heading.x && Math.sign(a.heading.x) === Math.sign(dx)) {
    buf = Math.min(buf, Math.abs(dx) / 2);
  }
  const bufA: Vec2 = { x: from.x + a.heading.x * buf, y: from.y + a.heading.y * buf };
  const bufB: Vec2 = { x: to.x + b.heading.x * buf, y: to.y + b.heading.y * buf };
  const obstacles: Bounds[] = [];
  if (a.obstacle) obstacles.push(a.obstacle);
  if (b.obstacle) obstacles.push(b.obstacle);
  const routed = elbowRoute(bufA, bufB, obstacles, {
    startHeading: a.heading,
    endHeading: b.heading,
  });
  const mid =
    routed && routed.length >= 2 ? routed : [bufA, fallbackCorner(bufA, bufB, a.heading), bufB];
  // Collapse only the interior corners — collapseColinear keeps the bufA / bufB
  // endpoints, so the stub joints survive even when colinear with the middle.
  return collapseColinear(mid);
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
    // No strict-interior match — the user dragged a segment adjacent to a
    // buffer joint (or the single middle segment of an aligned elbow).
    // Reconstruct the middle as a "staple" between the FIXED buffer joints
    // (out[0] = bufA, out[last] = bufB) so a segment of the pinned axis sits at
    // `pos` while the terminal buffers stay put (standard terminal-drag).
    const j0 = out[0]!;
    const j1 = out[out.length - 1]!;
    out =
      pin.axis === "h"
        ? [j0, { x: j0.x, y: pin.pos }, { x: j1.x, y: pin.pos }, j1]
        : [j0, { x: pin.pos, y: j0.y }, { x: pin.pos, y: j1.y }, j1];
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
  // floating / outline / ratio anchors: `self` is already the resolved point
  // ON the outline, so exit perpendicular to the edge it sits on. Nearest-edge
  // (not the centre cone test) keeps the exit outward even near corners.
  return { heading: headingForEdgePoint(shape, self), obstacle };
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
