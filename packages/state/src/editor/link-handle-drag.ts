import {
  getLink,
  getLinkCurvePoints,
  getLinkPath,
  isNoop,
  projectPointToPathT,
  updateLink,
  type LinkEndpoint,
  type Patch,
  type Scene,
} from "@oh-just-another/scene";
import type { ElementId, LinkId, Vec2 } from "@oh-just-another/types";
import { hitTest, vec2 } from "@oh-just-another/math";
import {
  DOUBLE_CLICK_MS,
  DOUBLE_CLICK_TOLERANCE_PX,
  LINK_LABEL_DRAG_SNAP_PX,
  WAYPOINT_COLLAPSE_RADIUS,
} from "../constants.js";
import { req } from "../helpers/util.js";
import { computeLinkEndpointUpdate } from "./applies/edge.js";
import type { InteractionEmit, PressTarget } from "../interaction/machine.js";

/**
 * Editor capabilities the link handle drags need. Keeps the controller off
 * the god-class: scene access, gesture transaction lifecycle, endpoint
 * snapping and hover feedback are delegated back to the Editor through this
 * narrow interface.
 */
export interface LinkHandleDragHost {
  /** Current scene (read + replace — live drags mutate through the gesture tx). */
  scene: Scene;
  /** Record a patch as one undo step (double-click delete / reset paths). */
  pushHistory(patch: Patch): void;
  /** Apply a live-drag patch into the open gesture transaction. */
  recordGesturePatch(patch: Patch): void;
  /** Commit the gesture transaction (one undo step for the whole drag). */
  commitGesture(): void;
  /** Cancel the gesture transaction (revert the live drag). */
  cancelGesture(): void;
  /** True while a gesture transaction is open (an endpoint move happened). */
  hasGestureTx(): boolean;
  /** Repaint + listener fan-out. */
  notify(): void;
  /** Attach target under the cursor (same resolution the drop uses). */
  linkAttachTargetAt(worldPoint: Vec2): PressTarget | undefined;
  /** Snap an endpoint to a target element / free point. */
  snapLinkEndpoint(targetId: ElementId | null, worldPoint: Vec2): LinkEndpoint;
  /** Drive the attach-point highlight (candidate dots + halo). */
  updateHoveredLinkTarget(worldPoint: Vec2): void;
  /** Drop the attach-point highlight. */
  clearHoveredLinkTarget(): void;
}

/**
 * Owns the link edit-handle drags: waypoint (bend point) drags, elbow
 * segment drags, endpoint rebind drags and the handle double-click
 * detector (delete waypoint / reset segment pin). Extracted from the
 * Editor god-class; the Editor keeps thin delegate wrappers so its public
 * API is unchanged.
 */
export class LinkHandleDragController {
  /**
   * Mid-drag preview state when the user is dragging an edge endpoint.
   * Drawn as an overlay line + handle dot so the user sees the target.
   */
  private _endpointDrag: {
    linkId: LinkId;
    side: "from" | "to";
    toPoint: Vec2;
  } | null = null;
  /**
   * Host-managed waypoint (bend-point) drag of the selected link. `index`
   * is the position in `edge.waypoints`. `pendingInsert` means the gesture
   * began on a segment midpoint and will splice a new waypoint on the
   * first move (so a no-move click adds nothing). Live-mutated through the
   * gesture transaction → one undo step per drag.
   */
  private _waypointDrag: {
    linkId: LinkId;
    index: number;
    pendingInsert: boolean;
  } | null = null;
  /**
   * Host-managed elbow segment drag. `axis` is the segment's orientation.
   * Dragging pins the segment's perpendicular coordinate into
   * `Link.fixedSegments`; the reroute pass re-flows the rest. One undo
   * step via the gesture tx.
   */
  private _segmentDrag: { linkId: LinkId; axis: "h" | "v"; at: number } | null = null;
  /**
   * Host-managed caption (label pill) drag along the link's path. The cursor
   * is projected back onto the drawn polyline so the pill can only slide
   * ALONG the link; near the arc-length middle it snaps back to the default
   * position (`label.position` removed). One undo step via the gesture tx.
   * `moved` distinguishes a click (kept for the double-click-to-edit chain)
   * from a real drag.
   */
  private _labelDrag: { linkId: LinkId; moved: boolean } | null = null;
  /** Wall-clock of the previous handle press — drives `isHandleDoubleClick`. */
  private lastHandleClickAt = 0;
  private lastHandleClickWorld: Vec2 | null = null;

  constructor(private readonly host: LinkHandleDragHost) {}

  get endpointDrag(): { linkId: LinkId; side: "from" | "to"; toPoint: Vec2 } | null {
    return this._endpointDrag;
  }

  get waypointDrag(): { linkId: LinkId; index: number; pendingInsert: boolean } | null {
    return this._waypointDrag;
  }

  get segmentDrag(): { linkId: LinkId; axis: "h" | "v"; at: number } | null {
    return this._segmentDrag;
  }

  get labelDrag(): { linkId: LinkId; moved: boolean } | null {
    return this._labelDrag;
  }

  get isDraggingLabel(): boolean {
    return this._labelDrag !== null;
  }

  /** Drop all drag state without committing (Escape / cancelInteraction). */
  reset(): void {
    this._waypointDrag = null;
    this._segmentDrag = null;
    this._endpointDrag = null;
    this._labelDrag = null;
  }

  /**
   * Live endpoint-rebind move: re-point the dragged end to the cursor in the
   * scene (a free `point` endpoint), recorded in the gesture transaction so the
   * WHOLE link redraws under the cursor with full fidelity — real style,
   * arrowhead, curved bow, and (via `rerouteElbows` in `render`) a live elbow
   * re-route. One undo step on commit; Escape cancels the transaction and the
   * link snaps back to where it was. The handle dot follows via `endpointDrag`.
   */
  applyEndpointMove(linkId: LinkId, side: "from" | "to", toPoint: Vec2): void {
    const edge = getLink(this.host.scene, linkId);
    if (!edge) return;
    // A real drag breaks the handle double-click chain (mirrors waypoint /
    // segment drags) so a quick click after dropping isn't read as a delete.
    this.lastHandleClickAt = 0;
    // Resolve the attach target under the cursor and snap the endpoint to it
    // with the SAME logic the drop uses, so the link attaches LIVE exactly as it
    // will commit — lands on the dot (fixed), floats on the body, or stays a
    // free point over empty space.
    const target = this.host.linkAttachTargetAt(toPoint);
    const targetId = target?.kind === "element" ? target.id : null;
    const ep = this.host.snapLinkEndpoint(targetId, toPoint);
    const r = updateLink(this.host.scene, linkId, (e) =>
      side === "from" ? { ...e, from: ep } : { ...e, to: ep },
    );
    this.host.scene = r.scene;
    this.host.recordGesturePatch(r.patch);
    this._endpointDrag = { linkId, side, toPoint };
    // Attach-point highlight — the SAME feedback as drawing a new link
    // (candidate dots + float-element halo), driven by `hoveredLinkTarget`.
    this.host.updateHoveredLinkTarget(toPoint);
    this.host.notify();
  }

  applyEndpointUpdate(emit: Extract<InteractionEmit, { type: "UPDATE_EDGE_ENDPOINT" }>): void {
    // A move opened a gesture transaction (live re-point per tick). The final
    // snapped endpoint goes into the SAME transaction so the net history step is
    // original → final (one undo). A pure click (no move, no tx) that resolves
    // to a no-op change must not leave a junk undo entry.
    const moved = this.host.hasGestureTx();
    const result = computeLinkEndpointUpdate(this.host.scene, emit, (toElement, toPoint) =>
      this.host.snapLinkEndpoint(toElement, toPoint),
    );
    if (result === null) {
      this.host.cancelGesture();
      this._endpointDrag = null;
      this.host.clearHoveredLinkTarget();
      this.host.notify();
      return;
    }
    if (!moved && isNoop(result.patch)) {
      this._endpointDrag = null;
      this.host.clearHoveredLinkTarget();
      this.host.notify();
      return;
    }
    this.host.scene = result.scene;
    this.host.recordGesturePatch(result.patch);
    this.host.commitGesture();
    this._endpointDrag = null;
    this.host.clearHoveredLinkTarget();
  }

  /** True while a waypoint of the selected link is being dragged. */
  get isDraggingWaypoint(): boolean {
    return this._waypointDrag !== null;
  }

  /**
   * Begin a host-managed waypoint drag. `insert` splices a new waypoint at
   * `index` on the first move (segment-midpoint "add" handle); otherwise an
   * existing waypoint at `index` is moved. Live-mutated through the gesture
   * transaction so the whole drag is one undo step.
   */
  beginWaypointDrag(linkId: LinkId, index: number, insert: boolean): void {
    if (!getLink(this.host.scene, linkId)) return;
    this._waypointDrag = { linkId, index, pendingInsert: insert };
  }

  /** Live update of the dragged waypoint to `world`. */
  updateWaypointDrag(world: Vec2): void {
    const drag = this._waypointDrag;
    if (!drag) return;
    // A real drag breaks the handle double-click chain (see updateSegmentDrag).
    this.lastHandleClickAt = 0;
    const edge = getLink(this.host.scene, drag.linkId);
    if (!edge) return;
    const wps = [...(edge.waypoints ?? [])];
    if (drag.pendingInsert) {
      wps.splice(drag.index, 0, world);
      drag.pendingInsert = false;
    } else {
      if (drag.index < 0 || drag.index >= wps.length) return;
      wps[drag.index] = world;
    }
    const r = updateLink(this.host.scene, drag.linkId, (e) => ({ ...e, waypoints: wps }));
    this.host.scene = r.scene;
    this.host.recordGesturePatch(r.patch);
    this.host.notify();
  }

  /**
   * Finish the waypoint drag. If the dragged waypoint landed within
   * `WAYPOINT_COLLAPSE_RADIUS` of an adjacent path point, it is removed
   * (drag-onto-the-line to delete). A no-move insert adds nothing.
   */
  endWaypointDrag(): void {
    const drag = this._waypointDrag;
    this._waypointDrag = null;
    if (!drag) return;
    if (drag.pendingInsert) {
      // Never moved → it was a click on a midpoint; nothing inserted.
      this.host.commitGesture();
      return;
    }
    const edge = getLink(this.host.scene, drag.linkId);
    if (edge?.waypoints && drag.index >= 0 && drag.index < edge.waypoints.length) {
      const path = getLinkPath(this.host.scene, edge);
      const wp = req(edge.waypoints[drag.index]);
      // Neighbours in the [from, ...waypoints, to] chain: path[index] and
      // path[index + 2] (path[0] = from, so waypoint i sits at path[i + 1]).
      // Dropping the waypoint back onto the straight segment between its
      // neighbours removes the bend ("drag onto the line to delete").
      const collapse = WAYPOINT_COLLAPSE_RADIUS / (this.host.scene.viewport.zoom || 1);
      const a = path?.[drag.index];
      const b = path?.[drag.index + 2];
      if (a && b && hitTest.distanceToSegment(wp, a, b) <= collapse) {
        const wps = edge.waypoints.filter((_, i) => i !== drag.index);
        const r = updateLink(this.host.scene, drag.linkId, (e) => ({ ...e, waypoints: wps }));
        this.host.scene = r.scene;
        this.host.recordGesturePatch(r.patch);
      }
    }
    this.host.commitGesture();
  }

  /** True while an elbow segment is being dragged. */
  get isDraggingSegment(): boolean {
    return this._segmentDrag !== null;
  }

  /**
   * Begin a host-managed elbow segment drag. `axis` is the segment's
   * orientation; `at` is its centre along its own axis (used to re-identify it
   * across re-routes).
   */
  beginSegmentDrag(linkId: LinkId, axis: "h" | "v", at: number): void {
    if (!getLink(this.host.scene, linkId)) return;
    this._segmentDrag = { linkId, axis, at };
  }

  /**
   * Move the dragged elbow segment perpendicular to its axis: pin its
   * perpendicular coordinate to the cursor. The reroute pass re-flows the
   * rest around the pin (one undo step via the gesture transaction).
   */
  updateSegmentDrag(world: Vec2): void {
    const drag = this._segmentDrag;
    if (!drag) return;
    // A real drag breaks the handle double-click chain, so a single click
    // right after pinning can't be misread as a double-click (= delete).
    this.lastHandleClickAt = 0;
    const edge = getLink(this.host.scene, drag.linkId);
    if (!edge) return;
    const pos = drag.axis === "h" ? world.y : world.x;
    const fixed = [...(edge.fixedSegments ?? [])];
    const entry = { axis: drag.axis, pos, at: drag.at };
    const at = fixed.findIndex((f) => f.axis === drag.axis && Math.abs(f.at - drag.at) < 0.5);
    if (at >= 0) fixed[at] = entry;
    else fixed.push(entry);
    const r = updateLink(this.host.scene, drag.linkId, (e) => ({ ...e, fixedSegments: fixed }));
    this.host.scene = r.scene;
    this.host.recordGesturePatch(r.patch);
    this.host.notify();
  }

  /** Finish the elbow segment drag (commit the gesture as one undo step). */
  endSegmentDrag(): void {
    if (!this._segmentDrag) return;
    this._segmentDrag = null;
    this.host.commitGesture();
  }

  /** Begin dragging the selected link's caption pill along its path. */
  beginLabelDrag(linkId: LinkId): void {
    if (!getLink(this.host.scene, linkId)?.label) return;
    this._labelDrag = { linkId, moved: false };
  }

  /** Live update: project the cursor onto the path, snap near the middle. */
  updateLabelDrag(world: Vec2): void {
    const drag = this._labelDrag;
    if (!drag) return;
    drag.moved = true;
    // A real drag breaks the handle double-click chain (see updateSegmentDrag).
    this.lastHandleClickAt = 0;
    const edge = getLink(this.host.scene, drag.linkId);
    if (!edge?.label) return;
    const path = getLinkCurvePoints(this.host.scene, edge);
    if (!path || path.length < 2) return;
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (a && b) total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    const t = projectPointToPathT(path, world);
    // Snap back to the default placement near the middle: remove the explicit
    // position so elbow links regain their longest-segment auto-placement.
    const zoom = this.host.scene.viewport.zoom || 1;
    const snapped = total > 0 && Math.abs(t - 0.5) * total < LINK_LABEL_DRAG_SNAP_PX / zoom;
    const r = updateLink(this.host.scene, drag.linkId, (e) => {
      if (!e.label) return e;
      if (snapped) {
        const { position: _position, ...rest } = e.label;
        void _position;
        return { ...e, label: rest };
      }
      return { ...e, label: { ...e.label, position: t } };
    });
    this.host.scene = r.scene;
    this.host.recordGesturePatch(r.patch);
    this.host.notify();
  }

  /** Finish the caption drag (commits the gesture as one undo step). */
  endLabelDrag(): void {
    if (!this._labelDrag) return;
    this._labelDrag = null;
    this.host.commitGesture();
  }

  /**
   * Double-click detector for link edit handles (waypoint / segment).
   * Returns true when this press follows the previous handle press within
   * the double-click window + tolerance. Updates state every call. Kept
   * separate from the up-side double-click path (handles return early in
   * `onDown`, so that path never sees them).
   */
  isHandleDoubleClick(world: Vec2): boolean {
    const now = performance.now();
    const isDouble =
      now - this.lastHandleClickAt < DOUBLE_CLICK_MS &&
      this.lastHandleClickWorld !== null &&
      vec2.distance(this.lastHandleClickWorld, world) <= DOUBLE_CLICK_TOLERANCE_PX;
    this.lastHandleClickAt = now;
    this.lastHandleClickWorld = world;
    return isDouble;
  }

  /**
   * Delete a free bend point (waypoint) from a straight / bezier link by
   * index — double-click a waypoint handle to remove it. One undo step.
   */
  deleteWaypoint(linkId: LinkId, index: number): void {
    const edge = getLink(this.host.scene, linkId);
    if (!edge?.waypoints || index < 0 || index >= edge.waypoints.length) return;
    const wps = edge.waypoints.filter((_, i) => i !== index);
    const r = updateLink(this.host.scene, linkId, (e) => ({ ...e, waypoints: wps }));
    this.host.scene = r.scene;
    this.host.pushHistory(r.patch);
    this.host.notify();
  }

  /**
   * Remove the pinned (fixed) elbow segment that matches the given
   * geometry — double-click a segment handle to return it to the auto
   * route. Matches by axis + nearest pinned perpendicular `pos` (exact for
   * a pinned segment), `at` as tiebreak. The reroute pass re-flows on the
   * next render (fixedSegments is part of the elbow signature). One undo
   * step.
   */
  resetSegmentPin(linkId: LinkId, axis: "h" | "v", pos: number, at: number): void {
    const edge = getLink(this.host.scene, linkId);
    if (!edge?.fixedSegments || edge.fixedSegments.length === 0) return;
    let bestIdx = -1;
    let bestD = Infinity;
    for (let i = 0; i < edge.fixedSegments.length; i++) {
      const f = req(edge.fixedSegments[i]);
      if (f.axis !== axis) continue;
      const d = Math.abs(f.pos - pos) + Math.abs(f.at - at) * 0.001;
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) return;
    const fixed = edge.fixedSegments.filter((_, i) => i !== bestIdx);
    const r = updateLink(this.host.scene, linkId, (e) => ({ ...e, fixedSegments: fixed }));
    this.host.scene = r.scene;
    this.host.pushHistory(r.patch);
    this.host.notify();
  }
}
