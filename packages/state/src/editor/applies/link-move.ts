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

/**
 * Snapshot the links that should follow a multi-element drag rigidly —
 * both endpoints bound to elements in `moved` AND carrying movable
 * geometry. Captured at press time so every frame translates from the
 * ORIGINAL geometry (cumulative delta), never compounding.
 */
export const snapshotRigidLinks = (
  scene: Scene,
  moved: ReadonlySet<ElementId>,
): Map<LinkId, Link> => {
  const out = new Map<LinkId, Link>();
  for (const link of scene.links.values()) {
    if (linkMovesRigidly(link, moved) && hasMovableGeometry(link)) out.set(link.id, link);
  }
  return out;
};

/**
 * Per-frame drag patches: translate each snapshot link to `origin +
 * delta`. `before` is the live link so the patch chain composes frame
 * to frame; `after` derives from the press-time snapshot.
 */
export const computeRigidLinkMovePatches = (
  scene: Scene,
  originLinks: ReadonlyMap<LinkId, Link>,
  delta: Vec2,
): Patch[] => {
  const out: Patch[] = [];
  for (const [id, origin] of originLinks) {
    const current = getLink(scene, id);
    if (!current) continue;
    const translated = translateLinkGeometry(origin, delta);
    if (!translated) continue;
    out.push({ kind: "link", id, before: current, after: { ...current, ...translated } });
  }
  return out;
};

/**
 * One-shot translation for committed moves (keyboard nudge): translate
 * every rigidly-moving link's CURRENT geometry by `delta`, threading the
 * scene so patches stack in one transaction. No snapshot needed — each
 * nudge is a discrete committed step.
 */
export const computeRigidLinkMoveForNudge = (
  scene: Scene,
  moved: ReadonlySet<ElementId>,
  delta: Vec2,
): { readonly scene: Scene; readonly patches: Patch[] } => {
  let s = scene;
  const patches: Patch[] = [];
  for (const link of [...scene.links.values()]) {
    if (!linkMovesRigidly(link, moved) || !hasMovableGeometry(link)) continue;
    const translated = translateLinkGeometry(link, delta);
    if (!translated) continue;
    const r = updateLink(s, link.id, (l) => ({ ...l, ...translated }));
    s = r.scene;
    patches.push(r.patch);
  }
  return { scene: s, patches };
};
