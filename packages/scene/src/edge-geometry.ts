import type { Vec2 } from "@oh-just-another/types";
import { intersect } from "@oh-just-another/math";
import { getAnchorWorld } from "./anchors.js";
import {
  catmullRomBeziers,
  cubicAt,
  cubicWithEndTangents,
  flattenSegments,
  type BezierSegment,
} from "./edge-curve.js";
import type { Link, LinkEndpoint } from "./edge.js";
import { getOutlinePoint, getOutlineSampler } from "./outline.js";
import { getElementWorldBounds, type ElementBase } from "./shape.js";
import type { Scene } from "./scene.js";
import { getElement } from "./queries.js";

/**
 * World-space centre of a shape's bounding box. Origin of the ray used to
 * resolve a `floating` endpoint.
 */
const shapeCentre = (shape: ElementBase): Vec2 => {
  const b = getElementWorldBounds(shape);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/**
 * Number of segments the outline is sampled into when intersecting it with
 * the floating-endpoint ray. 96 is smooth enough for ellipses at high zoom
 * without being a hot-loop cost (resolved once per edge per frame).
 */
const FLOATING_OUTLINE_SAMPLES = 96;

/**
 * Resolve a `floating` endpoint: the point where the shape's outline is
 * crossed by the ray from the shape's centre toward `toward` (the other
 * endpoint). Slides along the perimeter as either shape moves, always
 * entering from the side facing the partner.
 *
 * Falls back to the centre when the ray is degenerate (partner at the
 * centre) or the shape has no outline sampler. Picks the crossing nearest
 * to `toward` so a convex shape connects on its outward-facing side.
 */
const floatingOutlineWorld = (shape: ElementBase, toward: Vec2): Vec2 => {
  const centre = shapeCentre(shape);
  const dx = toward.x - centre.x;
  const dy = toward.y - centre.y;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return centre;

  const sampler = getOutlineSampler(shape.type);
  if (!sampler) return centre;

  // Extend the ray well past `toward` so the crossing is always inside the
  // tested segment even when `toward` sits on or inside the outline.
  const len = Math.hypot(dx, dy);
  const far: Vec2 = { x: centre.x + (dx / len) * 1e6, y: centre.y + (dy / len) * 1e6 };

  let best: Vec2 | null = null;
  let bestDist = Infinity;
  let prev = getOutlinePoint(shape, 0);
  for (let i = 1; i <= FLOATING_OUTLINE_SAMPLES; i++) {
    const cur = getOutlinePoint(shape, i / FLOATING_OUTLINE_SAMPLES);
    const hit = intersect.segmentSegment(centre, far, prev, cur);
    if (hit) {
      const d = Math.hypot(hit.x - toward.x, hit.y - toward.y);
      if (d < bestDist) {
        bestDist = d;
        best = hit;
      }
    }
    prev = cur;
  }
  return best ?? centre;
};

/**
 * Resolve a single `LinkEndpoint` to a world-space point.
 *
 * `kind: "point"` returns the stored position as-is. `kind: "anchor"`
 * looks up the referenced shape and resolves the anchor through
 * `getAnchorWorld` — picking up the shape's current position / rotation /
 * scale automatically.
 *
 * Returns `null` when an `anchor` endpoint references a shape id that
 * isn't (or no longer is) in the scene. Callers usually drop the edge
 * from the render pass in that case.
 *
 * `toward` is only consulted for `floating` endpoints — it's the world
 * point of the *other* endpoint, which the floating side aims at. When
 * omitted, a floating endpoint resolves to the shape's centre (used as a
 * provisional value before the partner is known; see `getLinkPath`).
 */
export const getLinkEndpointWorld = (
  scene: Scene,
  endpoint: LinkEndpoint,
  toward?: Vec2,
): Vec2 | null => {
  if (endpoint.kind === "point") return endpoint.position;
  const shape = getElement(scene, endpoint.elementId);
  if (!shape) return null;
  if (endpoint.kind === "anchor") return getAnchorWorld(shape, endpoint.anchor);
  if (endpoint.kind === "floating")
    return floatingOutlineWorld(shape, toward ?? shapeCentre(shape));
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
export const getLinkPath = (scene: Scene, edge: Link): readonly Vec2[] | null => {
  // Two-pass resolve so a `floating` endpoint can aim at its partner.
  // Pass 1: provisional points (floating → its own centre). Pass 2:
  // re-resolve floating ends toward the partner's provisional point. When
  // both ends float, each aims at the other shape's centre — stable.
  const fromProvisional = getLinkEndpointWorld(scene, edge.from);
  if (!fromProvisional) return null;
  const toProvisional = getLinkEndpointWorld(scene, edge.to);
  if (!toProvisional) return null;
  const from =
    edge.from.kind === "floating"
      ? (getLinkEndpointWorld(scene, edge.from, toProvisional) ?? fromProvisional)
      : fromProvisional;
  const to =
    edge.to.kind === "floating"
      ? (getLinkEndpointWorld(scene, edge.to, fromProvisional) ?? toProvisional)
      : toProvisional;

  const routing = edge.routing ?? "straight";

  if (routing !== "orthogonal") {
    // straight / bezier: honour user-placed waypoints (free bend points).
    return [from, ...(edge.waypoints ?? []), to];
  }

  // Orthogonal (elbow): the path is the router's output, stored on the edge
  // as `routedPoints` (corner points between from and to). Elbow points are
  // NOT user-placed — segments must stay axis-aligned — so `waypoints` are
  // ignored here. A *defined* `routedPoints` means the editor has routed this
  // edge — use it verbatim (empty = a straight run). Only fall back to the
  // side-aware heuristic when the edge has never been routed (undefined),
  // e.g. headless `getLinkPath` outside the editor's reroute pass.
  if (edge.routedPoints !== undefined) {
    return [from, ...edge.routedPoints, to];
  }

  // Orthogonal heuristic fallback — modern-style elbow with side-aware
  // stubs.
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
    const cursorTo = to;
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
const exitDirectionFor = (endpoint: Link["from"]): Vec2 | null => {
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
 * Used by `findLinkAt` for hit-testing.
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
 * Unit direction a curved link should leave/enter an endpoint along: the
 * edge's outward normal for a named-side anchor, else a fallback along the
 * dominant axis toward `toward` (so a free point / corner / floating end
 * gives a sensible flat-ish curve instead of a fixed one-sided bow).
 */
const curveEndDir = (endpoint: Link["from"], at: Vec2, toward: Vec2): Vec2 => {
  const named = exitDirectionFor(endpoint);
  if (named) return named;
  const dx = toward.x - at.x;
  const dy = toward.y - at.y;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: Math.sign(dx) || 1, y: 0 };
  return { x: 0, y: Math.sign(dy) || 1 };
};

/**
 * Cubic-bezier representation of a curved (bezier) edge: the start point and
 * the list of cubic segments. A no-waypoint span is a single cubic whose
 * control arms follow the endpoints' edge normals (exits/enters perpendicular
 * to the element edge — flowchart look); a waypointed span is a Catmull-Rom
 * spline through the bends. Returns `null` for non-bezier / unresolvable.
 */
export const getLinkCurveSegments = (
  scene: Scene,
  edge: Link,
): { start: Vec2; segments: BezierSegment[] } | null => {
  if ((edge.routing ?? "straight") !== "bezier") return null;
  const path = getLinkPath(scene, edge);
  if (!path || path.length < 2) return null;
  const start = path[0]!;
  const end = path[path.length - 1]!;
  if (path.length === 2) {
    const dirFrom = curveEndDir(edge.from, start, end);
    const dirTo = curveEndDir(edge.to, end, start);
    return { start, segments: [cubicWithEndTangents(start, end, dirFrom, dirTo)] };
  }
  return { start, segments: catmullRomBeziers(path) };
};

/**
 * Hit-test / bounds polyline for an edge: the routed path, except a curved
 * (bezier) edge is flattened to follow the drawn arc (so clicking the
 * visible curve — which bows away from the straight chord — actually hits).
 * Returns `null` when the path is unresolvable.
 */
export const getLinkCurvePoints = (scene: Scene, edge: Link): readonly Vec2[] | null => {
  if ((edge.routing ?? "straight") !== "bezier") return getLinkPath(scene, edge);
  const curve = getLinkCurveSegments(scene, edge);
  if (!curve) return null;
  return flattenSegments(curve.start, curve.segments);
};

/**
 * Per-span "add a waypoint" handle positions for a selected link's bend
 * editing — one handle per logical span of `[from, ...waypoints, to]`, index i
 * being the span between point i and i+1 (what `beginWaypointDrag(i, insert)`
 * expects). The handle sits at the VISUAL middle of its span:
 *   - bezier — the curve point at `t=0.5` of that span's cubic, so the handle
 *     lands ON the drawn arc (not the straight chord beside it);
 *   - straight — the chord midpoint (the span IS straight).
 * Returns `null` for orthogonal (elbow) links — their segment handles are
 * computed from the routed path by the caller — or when unresolvable.
 */
export const getLinkWaypointMidpoints = (scene: Scene, edge: Link): Vec2[] | null => {
  const routing = edge.routing ?? "straight";
  if (routing === "orthogonal") return null;
  if (routing === "bezier") {
    const curve = getLinkCurveSegments(scene, edge);
    if (!curve) return null;
    const mids: Vec2[] = [];
    let prev = curve.start;
    for (const s of curve.segments) {
      mids.push(cubicAt(prev, s.c1, s.c2, s.to, 0.5));
      prev = s.to;
    }
    return mids;
  }
  const path = getLinkPath(scene, edge);
  if (!path || path.length < 2) return null;
  const mids: Vec2[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    mids.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return mids;
};

/**
 * Topmost edge under `worldPoint`, or `null` if none is within
 * `threshold` world-pixels of any segment. Iterates edges in layer
 * order; later layers (rendered on top) win when paths overlap.
 *
 * Curved (bezier) edges are tested against the flattened curve (via
 * `getLinkCurvePoints`) so the clickable line matches the drawn arc.
 */
export const findLinkAt = (scene: Scene, worldPoint: Vec2, threshold = 5): Link | null => {
  let best: { edge: Link; distance: number } | null = null;
  for (const edge of scene.links.values()) {
    const path = getLinkCurvePoints(scene, edge);
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
