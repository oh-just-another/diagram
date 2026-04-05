import { getLink, updateLink, type Scene, type Link, type Patch } from "@oh-just-another/scene";
import type { ElementId, LinkId, Vec2 } from "@oh-just-another/types";

/**
 * Rigid connector move.
 *
 * A link whose BOTH endpoints are bound to elements inside the moved
 * selection translates as a rigid body — its stored ABSOLUTE geometry
 * (user waypoints / pinned elbow segments / routed corners) shifts by
 * the same delta as the elements, so the fixed middle moves with the
 * endpoints rather than staying put.
 *
 * Pure-routed links (no waypoints / fixedSegments / routedPoints) need
 * nothing here — their endpoints already re-resolve from the moved
 * elements' bounds every frame.
 */

/** An endpoint follows the move iff it's bound to an element in `moved`. */
const endpointInSet = (ep: Link["from"], moved: ReadonlySet<ElementId>): boolean =>
  ep.kind !== "point" && moved.has(ep.elementId);

/** Both endpoints bound to elements being moved → the link moves rigidly. */
export const linkMovesRigidly = (link: Link, moved: ReadonlySet<ElementId>): boolean =>
  endpointInSet(link.from, moved) && endpointInSet(link.to, moved);

/** Stored absolute geometry that wouldn't otherwise translate on a move. */
const hasMovableGeometry = (link: Link): boolean =>
  (link.waypoints?.length ?? 0) > 0 ||
  (link.fixedSegments?.length ?? 0) > 0 ||
  (link.routedPoints?.length ?? 0) > 0;

const shiftPts = (pts: readonly Vec2[], d: Vec2): Vec2[] =>
  pts.map((p) => ({ x: p.x + d.x, y: p.y + d.y }));

/**
 * Return only the geometry fields shifted by `delta`, or `null` when the
 * link carries no movable geometry. `fixedSegments` store a segment's
 * perpendicular coordinate (`pos`) and its centre along its own axis
 * (`at`): an `"h"` (horizontal) segment's `pos` is a Y and `at` is an X;
 * a `"v"` segment is the reverse. Both shift so the segment re-identifies
 * after the route re-flows.
 */
export const translateLinkGeometry = (
  link: Link,
  delta: Vec2,
): Pick<Link, "waypoints" | "fixedSegments" | "routedPoints"> | null => {
  if (!hasMovableGeometry(link)) return null;
  const out: {
    waypoints?: readonly Vec2[];
    fixedSegments?: readonly { readonly axis: "h" | "v"; readonly pos: number; readonly at: number }[];
    routedPoints?: readonly Vec2[];
  } = {};
  if (link.waypoints?.length) out.waypoints = shiftPts(link.waypoints, delta);
  if (link.fixedSegments?.length) {
    out.fixedSegments = link.fixedSegments.map((s) => ({
      axis: s.axis,
      pos: s.pos + (s.axis === "h" ? delta.y : delta.x),
      at: s.at + (s.axis === "h" ? delta.x : delta.y),
    }));
  }
  if (link.routedPoints?.length) out.routedPoints = shiftPts(link.routedPoints, delta);
  return out;
};

/** A `point` endpoint shifted by `delta`; bound endpoints pass through. */
const shiftEndpoint = (ep: Link["from"], delta: Vec2): Link["from"] =>
  ep.kind === "point" ? { kind: "point", position: { x: ep.position.x + delta.x, y: ep.position.y + delta.y } } : ep;

/**
 * Translate a link for a DRAG: its geometry (waypoints / fixedSegments /
 * routedPoints) PLUS any free `point` endpoints, by `delta`. Bound
 * endpoints (anchor / outline / floating) are left alone — they re-resolve
 * from their (also-moving) elements. Returns the changed fields, or `null`
 * when there's nothing to move (a pure auto-routed bound link).
 */
export const translateLinkForDrag = (
  link: Link,
  delta: Vec2,
): Partial<Link> | null => {
  const geom = translateLinkGeometry(link, delta);
  const fromMoves = link.from.kind === "point";
  const toMoves = link.to.kind === "point";
  if (!geom && !fromMoves && !toMoves) return null;
  const out: { -readonly [K in keyof Link]?: Link[K] } = { ...(geom ?? {}) };
  if (fromMoves) out.from = shiftEndpoint(link.from, delta);
  if (toMoves) out.to = shiftEndpoint(link.to, delta);
  return out;
};

/**
 * Scale a link for a GROUP RESIZE: its geometry (waypoints / fixedSegments /
 * routedPoints) and any free `point` endpoints scale about the anchor
 * `(ax, ay)` by `(sx, sy)` — the same transform the resized elements undergo,
 * so the connector stretches with the box in both size and coordinates. Bound
 * endpoints are left alone (they re-resolve from their own scaled elements).
 * `null` when there's nothing to scale.
 */
export const scaleLinkAround = (
  link: Link,
  ax: number,
  ay: number,
  sx: number,
  sy: number,
): Partial<Link> | null => {
  const sp = (p: Vec2): Vec2 => ({ x: ax + (p.x - ax) * sx, y: ay + (p.y - ay) * sy });
  const fromMoves = link.from.kind === "point";
  const toMoves = link.to.kind === "point";
  if (!hasMovableGeometry(link) && !fromMoves && !toMoves) return null;
  const out: { -readonly [K in keyof Link]?: Link[K] } = {};
  if (link.waypoints?.length) out.waypoints = link.waypoints.map(sp);
  if (link.fixedSegments?.length) {
    out.fixedSegments = link.fixedSegments.map((s) => ({
      axis: s.axis,
      // `pos` is the segment's perpendicular coord (h→Y, v→X), `at` its
      // centre along its own axis (h→X, v→Y) — scale each on its own axis.
      pos: s.axis === "h" ? ay + (s.pos - ay) * sy : ax + (s.pos - ax) * sx,
      at: s.axis === "h" ? ax + (s.at - ax) * sx : ay + (s.at - ay) * sy,
    }));
  }
  if (link.routedPoints?.length) out.routedPoints = link.routedPoints.map(sp);
  if (link.from.kind === "point") out.from = { kind: "point", position: sp(link.from.position) };
  if (link.to.kind === "point") out.to = { kind: "point", position: sp(link.to.position) };
  return out;
};

/** A link moves with a drag when it's selected OR rigidly bound to moved elements. */
const linkMovesWithDrag = (
  link: Link,
  moved: ReadonlySet<ElementId>,
  selected: ReadonlySet<LinkId>,
): boolean => selected.has(link.id) || linkMovesRigidly(link, moved);

/**
 * Snapshot links that follow a drag: every SELECTED link (translated whole,
 * incl. free point endpoints) plus links bound on both ends to `moved`
 * elements (geometry-only — their endpoints already follow). Captured at
 * press time so each frame translates from the ORIGINAL, never compounding.
 */
export const snapshotMovingLinks = (
  scene: Scene,
  moved: ReadonlySet<ElementId>,
  selected: ReadonlySet<LinkId>,
): Map<LinkId, Link> => {
  const out = new Map<LinkId, Link>();
  for (const link of scene.links.values()) {
    if (linkMovesWithDrag(link, moved, selected) && translateLinkForDrag(link, { x: 0, y: 0 }) !== null) {
      out.set(link.id, link);
    }
  }
  return out;
};

/**
 * Per-frame drag patches: translate each snapshot link to `origin + delta`.
 * `before` is the live link so the patch chain composes frame to frame.
 */
export const computeMovingLinkPatches = (
  scene: Scene,
  originLinks: ReadonlyMap<LinkId, Link>,
  delta: Vec2,
): Patch[] => {
  const out: Patch[] = [];
  for (const [id, origin] of originLinks) {
    const current = getLink(scene, id);
    if (!current) continue;
    const translated = translateLinkForDrag(origin, delta);
    if (!translated) continue;
    out.push({ kind: "link", id, before: current, after: { ...current, ...translated } });
  }
  return out;
};

/**
 * One-shot translation for committed moves (keyboard nudge): translate every
 * moving link's CURRENT geometry + free endpoints by `delta`, threading the
 * scene so patches stack in one transaction. No snapshot needed — each nudge
 * is a discrete committed step.
 */
export const computeMovingLinkForNudge = (
  scene: Scene,
  moved: ReadonlySet<ElementId>,
  selected: ReadonlySet<LinkId>,
  delta: Vec2,
): { readonly scene: Scene; readonly patches: Patch[] } => {
  let s = scene;
  const patches: Patch[] = [];
  for (const link of [...scene.links.values()]) {
    if (!linkMovesWithDrag(link, moved, selected)) continue;
    const translated = translateLinkForDrag(link, delta);
    if (!translated) continue;
    const r = updateLink(s, link.id, (l) => ({ ...l, ...translated }));
    s = r.scene;
    patches.push(r.patch);
  }
  return { scene: s, patches };
};
