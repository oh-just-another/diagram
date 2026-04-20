import type { Bounds, ElementId, Vec2 } from "@oh-just-another/types";
import {
  ELBOW_AVOID_MAX_OBSTACLES,
  ELBOW_CROSS_SAMPLE_STEP,
  ELBOW_OBSTACLE_CLEARANCE,
  ELBOW_OBSTACLE_MARGIN,
  ELBOW_TERMINAL_BUFFER,
  ELBOW_WRAP_HYSTERESIS,
} from "./constants.js";
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

const req = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error("packages/scene: index out of range");
  return v;
};

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
    edge.from.kind === "floating" ? (getLinkEndpointWorld(scene, edge.from, toP) ?? fromP) : fromP;
  const to =
    edge.to.kind === "floating" ? (getLinkEndpointWorld(scene, edge.to, fromP) ?? toP) : toP;
  if (from.x === to.x && from.y === to.y) return [];

  const a = endInfo(scene, edge.from, from, to);
  const b = endInfo(scene, edge.to, to, from);
  // The route is structured as a fixed outward BUFFER stub at each end plus a
  // movable middle between the two stub joints (bufA / bufB). `routeMiddle`
  // returns [bufA, ...corners..., bufB]; the buffers themselves are the
  // from→bufA / bufB→to segments that `getLinkPath` adds when it wraps
  // routedPoints with from/to — they're never collapsed, so an aligned elbow
  // still has 3 segments (buffer + movable + buffer) and reads as one line.
  // "Avoid obstacles" mode: route around EVERY scene shape, not just the two
  // bound ends. Collect the rest of the scene as obstacles and let A* find a
  // clear orthogonal path (the analytic mid-S / C-wrap only know the two bound
  // boxes, so they're skipped in this mode).
  const avoidList = edge.avoidObstacles === true ? collectAvoidObstacles(scene, edge) : undefined;
  // Perf gate: above the cap, skip whole-scene avoidance (too many obstacle
  // corners to A* every frame) and fall back to the cheap two-box elbow.
  const avoid = avoidList && avoidList.length <= ELBOW_AVOID_MAX_OBSTACLES ? avoidList : undefined;
  // Pass the previously routed path as a side-hint so the C-wrap stays on
  // the same side under a small drag (hysteresis — see wrapRoute). This is
  // the only history the elbow router consults; the A* core stays pure.
  let middle = routeMiddle(from, to, a, b, edge.routedPoints, avoid);
  middle = applyFixedSegments(middle, edge.fixedSegments);
  return middle;
};

/**
 * World bboxes of every scene element EXCEPT the link's own two bound shapes
 * (those are handled by the headings/dongles). Used by "avoid obstacles" mode.
 */
const collectAvoidObstacles = (scene: Scene, edge: Link): Bounds[] => {
  const skip = new Set<ElementId>();
  for (const ep of [edge.from, edge.to]) if (ep.kind !== "point") skip.add(ep.elementId);
  const out: Bounds[] = [];
  for (const el of scene.elements.values()) {
    if (skip.has(el.id)) continue;
    out.push(getElementWorldBounds(el));
  }
  return out;
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
const routeMiddle = (
  from: Vec2,
  to: Vec2,
  a: EndInfo,
  b: EndInfo,
  prev?: readonly Vec2[],
  avoid?: readonly Bounds[],
): Vec2[] => {
  // FIXED buffer: every terminal stub is exactly ELBOW_TERMINAL_BUFFER — one
  // constant length, never shrunk. bufA / bufB are the stub joints.
  const buf = ELBOW_TERMINAL_BUFFER;
  const bufA: Vec2 = { x: from.x + a.heading.x * buf, y: from.y + a.heading.y * buf };
  const bufB: Vec2 = { x: to.x + b.heading.x * buf, y: to.y + b.heading.y * buf };
  const obstacles: Bounds[] = [];
  if (a.obstacle) obstacles.push(a.obstacle);
  if (b.obstacle) obstacles.push(b.obstacle);
  // Avoid-obstacles mode: route around the whole scene via A* (the analytic
  // mid-S / C-wrap only reason about the two bound boxes). Include the bound
  // boxes too so the route still keeps clear of its own ends.
  if (avoid) {
    const all = [...obstacles, ...avoid];
    const routed = elbowRoute(bufA, bufB, all, { startHeading: a.heading, endHeading: b.heading });
    const mid =
      routed && routed.length >= 2 ? routed : [bufA, fallbackCorner(bufA, bufB, a.heading), bufB];
    return collapseColinear(mid);
  }
  // Collinear-opposite stubs (top↔bottom, left↔right): build a clean,
  // deterministic centred S/Z whose crossover sits in the MIDDLE between the
  // two stub joints — same rule whether the shapes overlap or are separated, so
  // dragging never makes the crossover jump (A* would snap it to a grid line).
  // Fall back to A* only if that path would clip a bound shape.
  const midS = midS_(from, to, a, b, bufA, bufB);
  if (midS && !pathCrossesObstacle(midS, obstacles)) return collapseColinear(midS);
  // The centred crossover would clip a shape (collinear-opposite ends whose
  // boxes overlap on the cross axis — e.g. lower.left → upper.right when the
  // boxes overlap vertically). Wrap deterministically around the union of the
  // obstacles on ONE consistently-chosen side instead of letting A* flip-flop
  // between routing over the top and under the bottom as the shape is dragged.
  const wrap = wrapRoute(from, to, a, b, bufA, bufB, obstacles, prev);
  if (wrap && !pathCrossesObstacle(wrap, obstacles)) return collapseColinear(wrap);
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

/**
 * For two COLLINEAR-OPPOSITE stubs (top↔bottom or left↔right — the two exit
 * headings point along the same axis in opposite directions), return a 4-point
 * S/Z `[bufA, c1, c2, bufB]` whose crossover sits at the midpoint between the
 * joints. One deterministic rule covers the whole drag:
 *   - OVERLAP (the joints have crossed along the exit axis, e.g. tight gap or
 *     the boxes overlap vertically): the crossover is the SHORT cross-axis step,
 *     placed at the cross-axis midpoint (mx / my) — a smooth mid-bend.
 *   - SEPARATED (the joints haven't crossed): the crossover is the long
 *     cross-run, placed at the exit-axis midpoint between the two buffers.
 * Both forms degenerate to the same straight segment at the boundary (gap =
 * 2×buffer), so the route is continuous as the shape is dragged — no jump to a
 * grid line the way A* does. Returns null for non-collinear pairs (L-shapes,
 * same-side), where A* is the right tool. `pathCrossesObstacle` rejects the
 * result if the centred path would clip a bound shape (then A* takes over).
 */
const midS_ = (
  from: Vec2,
  to: Vec2,
  a: EndInfo,
  b: EndInfo,
  bufA: Vec2,
  bufB: Vec2,
): Vec2[] | null => {
  // Vertical pair (e.g. bottom→top): stubs run along Y.
  if (a.heading.y !== 0 && b.heading.y === -a.heading.y) {
    const overlap = Math.sign(bufA.y - bufB.y) === Math.sign(a.heading.y);
    if (overlap) {
      // Joints crossed: short vertical step at the horizontal midpoint.
      const mx = (from.x + to.x) / 2;
      return [bufA, { x: mx, y: bufA.y }, { x: mx, y: bufB.y }, bufB];
    }
    // Separated: horizontal cross-run at the vertical midpoint between buffers.
    const my = (bufA.y + bufB.y) / 2;
    return [bufA, { x: bufA.x, y: my }, { x: bufB.x, y: my }, bufB];
  }
  // Horizontal pair (e.g. right→left): stubs run along X.
  if (a.heading.x !== 0 && b.heading.x === -a.heading.x) {
    const overlap = Math.sign(bufA.x - bufB.x) === Math.sign(a.heading.x);
    if (overlap) {
      // Joints crossed: short horizontal step at the vertical midpoint.
      const my = (from.y + to.y) / 2;
      return [bufA, { x: bufA.x, y: my }, { x: bufB.x, y: my }, bufB];
    }
    // Separated: vertical cross-run at the horizontal midpoint between buffers.
    const mx = (bufA.x + bufB.x) / 2;
    return [bufA, { x: mx, y: bufA.y }, { x: mx, y: bufB.y }, bufB];
  }
  return null;
};

/**
 * Pick one of two outside-the-union crossover coordinates (`lo` = top/left,
 * `hi` = bottom/right) with HYSTERESIS so a small drag doesn't flip the side.
 *
 * `mid` is the endpoints' midpoint along the cross axis; `centre` the union
 * centre. The natural (shortest) side is whichever the midpoint leans toward.
 * But near the centre — exactly where a diagonal-overlap configuration rests —
 * a bare threshold flips top↔bottom every frame under a drag (jitter). So
 * within `ELBOW_WRAP_HYSTERESIS` of the centre we KEEP the previous side
 * (`prevLo`: was the last route on the `lo` side?); the side only switches once
 * the midpoint moves past the centre by the band. This is the only history the
 * elbow router consults — the A* core stays pure (see
 *,
 */
const pickWrapSide = (
  mid: number,
  centre: number,
  lo: number,
  hi: number,
  prevLo: boolean | null,
): number => {
  const naturalLo = mid <= centre;
  if (prevLo !== null && Math.abs(mid - centre) < ELBOW_WRAP_HYSTERESIS) {
    return prevLo ? lo : hi;
  }
  return naturalLo ? lo : hi;
};

/**
 * Deterministic C-wrap for a collinear-opposite pair whose centred crossover
 * (the {@link midS_} thread) would clip a shape — i.e. the two boxes overlap on
 * the cross axis, so there's no gap to thread. Route the crossover run just
 * OUTSIDE the union of the obstacles, on one side (top/bottom for a horizontal
 * pair, left/right for a vertical pair). The side is chosen by
 * {@link pickWrapSide} with hysteresis off the previous route (`prev`) so a
 * small drag near the union centre no longer flips the route ("jitter").
 */
const wrapRoute = (
  from: Vec2,
  to: Vec2,
  a: EndInfo,
  b: EndInfo,
  bufA: Vec2,
  bufB: Vec2,
  obstacles: readonly Bounds[],
  prev?: readonly Vec2[],
): Vec2[] | null => {
  if (obstacles.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of obstacles) {
    minX = Math.min(minX, o.x);
    minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + o.width);
    maxY = Math.max(maxY, o.y + o.height);
  }
  const m = ELBOW_OBSTACLE_MARGIN;
  minX -= m;
  minY -= m;
  maxX += m;
  maxY += m;
  // Horizontal pair (ends exit ±x): the crossover is a horizontal run; place it
  // just above or below the union.
  if (a.heading.y === 0 && b.heading.y === 0 && a.heading.x !== 0 && b.heading.x === -a.heading.x) {
    const my = (from.y + to.y) / 2;
    const yPick = pickWrapSide(my, (minY + maxY) / 2, minY, maxY, prevWrapLo(prev, "y"));
    return [bufA, { x: bufA.x, y: yPick }, { x: bufB.x, y: yPick }, bufB];
  }
  // Vertical pair (ends exit ±y): the crossover is a vertical run; place it just
  // left or right of the union.
  if (a.heading.x === 0 && b.heading.x === 0 && a.heading.y !== 0 && b.heading.y === -a.heading.y) {
    const mx = (from.x + to.x) / 2;
    const xPick = pickWrapSide(mx, (minX + maxX) / 2, minX, maxX, prevWrapLo(prev, "x"));
    return [bufA, { x: xPick, y: bufA.y }, { x: xPick, y: bufB.y }, bufB];
  }
  return null;
};

/**
 * Which side did the previous wrap take? The crossover run sits OUTSIDE the
 * union, beyond the two endpoints (`prev[0]` / `prev[last]` = the stub joints).
 * So a `lo`-side wrap dips the path's minimum BELOW the endpoints' band, and a
 * `hi`-side wrap pushes the maximum ABOVE it. Compare those overshoots. Returns
 * `null` when there's no usable previous path (first route, degenerate, or no
 * overshoot either way) — the caller then uses the natural side.
 */
const prevWrapLo = (prev: readonly Vec2[] | undefined, axis: "x" | "y"): boolean | null => {
  if (!prev || prev.length < 3) return null;
  const at = (p: Vec2): number => (axis === "y" ? p.y : p.x);
  const first = at(req(prev[0]));
  const last = at(req(prev[prev.length - 1]));
  const endLo = Math.min(first, last);
  const endHi = Math.max(first, last);
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of prev) {
    const v = at(p);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const overLo = endLo - lo; // how far the path dips below the endpoints
  const overHi = hi - endHi; // how far it rises above them
  if (overLo <= 0 && overHi <= 0) return null; // no crossover overshoot → no hint
  return overLo >= overHi;
};

/** True if any axis-aligned segment of `path` passes through an obstacle's
 * interior (sampled; a margin keeps the line off the very edge). */
const pathCrossesObstacle = (path: readonly Vec2[], obstacles: readonly Bounds[]): boolean => {
  const m = ELBOW_OBSTACLE_CLEARANCE; // inset so edge-touching isn't a "cross"
  for (let i = 1; i < path.length; i++) {
    const p = req(path[i - 1]);
    const q = req(path[i]);
    for (let t = 0; t <= 1; t += ELBOW_CROSS_SAMPLE_STEP) {
      const x = p.x + (q.x - p.x) * t;
      const y = p.y + (q.y - p.y) * t;
      for (const o of obstacles) {
        if (x > o.x + m && x < o.x + o.width - m && y > o.y + m && y < o.y + o.height - m)
          return true;
      }
    }
  }
  return false;
};

/** EndInfo for a raw point that may sit on a shape (preview). */
const pointEndInfo = (scene: Scene, elId: ElementId | null, self: Vec2, other: Vec2): EndInfo => {
  if (!elId) return { heading: headingForPoint(other, self), obstacle: null };
  const shape = getElement(scene, elId);
  if (!shape) return { heading: headingForPoint(other, self), obstacle: null };
  return {
    heading: headingForPointFromElement(shape, self),
    obstacle: getElementWorldBounds(shape),
  };
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
      const a = req(out[k]);
      const b = req(out[k + 1]);
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
      const a = req(out[bestK]);
      const b = req(out[bestK + 1]);
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
    const j0 = req(out[0]);
    const j1 = req(out[out.length - 1]);
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
  const out: Vec2[] = [req(points[0])];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = req(out[out.length - 1]);
    const cur = req(points[i]);
    const next = req(points[i + 1]);
    const eps = 1e-6;
    const horizontal = Math.abs(prev.y - cur.y) < eps && Math.abs(cur.y - next.y) < eps;
    const vertical = Math.abs(prev.x - cur.x) < eps && Math.abs(cur.x - next.x) < eps;
    const coincident = Math.abs(prev.x - cur.x) < eps && Math.abs(prev.y - cur.y) < eps;
    if (horizontal || vertical || coincident) continue;
    out.push(cur);
  }
  out.push(req(points[points.length - 1]));
  return out;
};
