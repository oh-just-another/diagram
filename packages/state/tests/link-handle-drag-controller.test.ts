import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addLink,
  emptyScene,
  getLink,
  orderBetween,
  type Link,
  type Patch,
  type Scene,
} from "@oh-just-another/scene";
import {
  LinkHandleDragController,
  type LinkHandleDragHost,
} from "../src/editor/link-handle-drag.js";
import { DOUBLE_CLICK_MS } from "../src/constants.js";

const L = linkId("L");

// A straight horizontal link from (0,100) to (200,100) — single segment,
// midpoint (100,100).
const horizontalLink = (extra: Partial<Link> = {}): Link => ({
  id: L,
  layerId: DEFAULT_LAYER_ID,
  from: { kind: "point", position: { x: 0, y: 100 } },
  to: { kind: "point", position: { x: 200, y: 100 } },
  order: orderBetween(null, null),
  style: { stroke: "#000" },
  ...extra,
});

const sceneWith = (link: Link): Scene => addLink(emptyScene(), link).scene;

interface Harness {
  host: LinkHandleDragHost;
  c: LinkHandleDragController;
  pushed: Patch[];
  gesture: Patch[];
  commitGesture: ReturnType<typeof vi.fn>;
  cancelGesture: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
}

const makeHarness = (scene: Scene): Harness => {
  const pushed: Patch[] = [];
  const gesture: Patch[] = [];
  const commitGesture = vi.fn();
  const cancelGesture = vi.fn();
  const notify = vi.fn();
  const host: LinkHandleDragHost = {
    scene,
    pushHistory: (p) => pushed.push(p),
    recordGesturePatch: (p) => gesture.push(p),
    commitGesture,
    cancelGesture,
    hasGestureTx: () => gesture.length > 0,
    notify,
    linkAttachTargetAt: () => undefined,
    snapLinkEndpoint: (_targetId, worldPoint) => ({ kind: "point", position: worldPoint }),
    updateHoveredLinkTarget: () => {},
    clearHoveredLinkTarget: () => {},
  };
  return {
    host,
    c: new LinkHandleDragController(host),
    pushed,
    gesture,
    commitGesture,
    cancelGesture,
    notify,
  };
};

describe("LinkHandleDragController", () => {
  describe("waypoint drag", () => {
    it("begin + update moves an existing waypoint through the gesture tx", () => {
      const h = makeHarness(sceneWith(horizontalLink({ waypoints: [{ x: 100, y: 100 }] })));
      h.c.beginWaypointDrag(L, 0, false);
      expect(h.c.isDraggingWaypoint).toBe(true);
      h.c.updateWaypointDrag({ x: 100, y: 50 });
      expect(getLink(h.host.scene, L)?.waypoints).toEqual([{ x: 100, y: 50 }]);
      expect(h.gesture).toHaveLength(1);
      expect(h.pushed).toHaveLength(0);
    });

    it("begin on a missing link is a no-op", () => {
      const h = makeHarness(sceneWith(horizontalLink()));
      h.c.beginWaypointDrag(linkId("nope"), 0, false);
      expect(h.c.isDraggingWaypoint).toBe(false);
    });

    it("insert splices a new waypoint on the FIRST move only", () => {
      const h = makeHarness(sceneWith(horizontalLink()));
      h.c.beginWaypointDrag(L, 0, true);
      h.c.updateWaypointDrag({ x: 100, y: 50 });
      expect(getLink(h.host.scene, L)?.waypoints).toEqual([{ x: 100, y: 50 }]);
      h.c.updateWaypointDrag({ x: 100, y: 40 });
      // Second move updates in place — no second splice.
      expect(getLink(h.host.scene, L)?.waypoints).toEqual([{ x: 100, y: 40 }]);
    });

    it("no-move insert click commits without adding a waypoint", () => {
      const h = makeHarness(sceneWith(horizontalLink()));
      h.c.beginWaypointDrag(L, 0, true);
      h.c.endWaypointDrag();
      expect(getLink(h.host.scene, L)?.waypoints).toBeUndefined();
      expect(h.commitGesture).toHaveBeenCalledTimes(1);
      expect(h.c.isDraggingWaypoint).toBe(false);
    });

    it("dropping a waypoint back onto the line between its neighbours removes it", () => {
      const h = makeHarness(sceneWith(horizontalLink({ waypoints: [{ x: 100, y: 50 }] })));
      h.c.beginWaypointDrag(L, 0, false);
      // Land ~on the straight from→to segment (y = 100).
      h.c.updateWaypointDrag({ x: 100, y: 101 });
      h.c.endWaypointDrag();
      expect(getLink(h.host.scene, L)?.waypoints).toEqual([]);
      expect(h.commitGesture).toHaveBeenCalledTimes(1);
    });

    it("a waypoint dropped away from the line survives", () => {
      const h = makeHarness(sceneWith(horizontalLink({ waypoints: [{ x: 100, y: 50 }] })));
      h.c.beginWaypointDrag(L, 0, false);
      h.c.updateWaypointDrag({ x: 100, y: 30 });
      h.c.endWaypointDrag();
      expect(getLink(h.host.scene, L)?.waypoints).toEqual([{ x: 100, y: 30 }]);
    });
  });

  describe("segment drag", () => {
    it("pins the segment's perpendicular coordinate into fixedSegments", () => {
      const h = makeHarness(sceneWith(horizontalLink({ routing: "orthogonal" })));
      h.c.beginSegmentDrag(L, "h", 100);
      expect(h.c.isDraggingSegment).toBe(true);
      h.c.updateSegmentDrag({ x: 100, y: 60 });
      expect(getLink(h.host.scene, L)?.fixedSegments).toEqual([{ axis: "h", pos: 60, at: 100 }]);
      h.c.updateSegmentDrag({ x: 100, y: 40 });
      // Same segment re-pinned in place, not appended.
      expect(getLink(h.host.scene, L)?.fixedSegments).toEqual([{ axis: "h", pos: 40, at: 100 }]);
      h.c.endSegmentDrag();
      expect(h.c.isDraggingSegment).toBe(false);
      expect(h.commitGesture).toHaveBeenCalledTimes(1);
    });

    it("endSegmentDrag without an active drag does not commit", () => {
      const h = makeHarness(sceneWith(horizontalLink()));
      h.c.endSegmentDrag();
      expect(h.commitGesture).not.toHaveBeenCalled();
    });
  });

  describe("endpoint drag", () => {
    it("applyEndpointMove re-points the end live through the gesture tx", () => {
      const h = makeHarness(sceneWith(horizontalLink()));
      h.c.applyEndpointMove(L, "to", { x: 300, y: 150 });
      expect(getLink(h.host.scene, L)?.to).toEqual({
        kind: "point",
        position: { x: 300, y: 150 },
      });
      expect(h.gesture).toHaveLength(1);
      expect(h.c.endpointDrag).toEqual({ linkId: L, side: "to", toPoint: { x: 300, y: 150 } });
    });

    it("applyEndpointUpdate commits the moved endpoint into the same gesture", () => {
      const h = makeHarness(sceneWith(horizontalLink()));
      h.c.applyEndpointMove(L, "to", { x: 300, y: 150 });
      h.c.applyEndpointUpdate({
        type: "UPDATE_EDGE_ENDPOINT",
        linkId: L,
        side: "to",
        toElement: null,
        toPoint: { x: 300, y: 150 },
      });
      expect(h.commitGesture).toHaveBeenCalledTimes(1);
      expect(h.c.endpointDrag).toBeNull();
    });

    it("a pure click (no prior move) commits the snapped endpoint as one step", () => {
      const h = makeHarness(sceneWith(horizontalLink()));
      h.c.applyEndpointUpdate({
        type: "UPDATE_EDGE_ENDPOINT",
        linkId: L,
        side: "to",
        toElement: null,
        toPoint: { x: 200, y: 100 }, // exactly where `to` already is
      });
      expect(h.gesture).toHaveLength(1);
      expect(h.commitGesture).toHaveBeenCalledTimes(1);
      expect(h.c.endpointDrag).toBeNull();
    });

    it("update on a vanished link cancels the gesture", () => {
      const h = makeHarness(sceneWith(horizontalLink()));
      h.c.applyEndpointUpdate({
        type: "UPDATE_EDGE_ENDPOINT",
        linkId: linkId("gone"),
        side: "to",
        toElement: null,
        toPoint: { x: 0, y: 0 },
      });
      expect(h.cancelGesture).toHaveBeenCalledTimes(1);
    });
  });

  describe("double-click detector", () => {
    beforeEach(() => {
      vi.spyOn(performance, "now").mockReturnValue(1000);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("two presses at the same point within the window read as a double-click", () => {
      const h = makeHarness(sceneWith(horizontalLink()));
      expect(h.c.isHandleDoubleClick({ x: 10, y: 10 })).toBe(false);
      vi.spyOn(performance, "now").mockReturnValue(1000 + DOUBLE_CLICK_MS - 1);
      expect(h.c.isHandleDoubleClick({ x: 10, y: 10 })).toBe(true);
    });

    it("a slow second press is NOT a double-click", () => {
      const h = makeHarness(sceneWith(horizontalLink()));
      expect(h.c.isHandleDoubleClick({ x: 10, y: 10 })).toBe(false);
      vi.spyOn(performance, "now").mockReturnValue(1000 + DOUBLE_CLICK_MS + 1);
      expect(h.c.isHandleDoubleClick({ x: 10, y: 10 })).toBe(false);
    });

    it("a real drag breaks the double-click chain", () => {
      const h = makeHarness(sceneWith(horizontalLink({ waypoints: [{ x: 100, y: 50 }] })));
      expect(h.c.isHandleDoubleClick({ x: 10, y: 10 })).toBe(false);
      h.c.beginWaypointDrag(L, 0, false);
      h.c.updateWaypointDrag({ x: 100, y: 30 }); // resets lastHandleClickAt
      h.c.endWaypointDrag();
      expect(h.c.isHandleDoubleClick({ x: 10, y: 10 })).toBe(false);
    });
  });

  describe("delete / reset (one undo step each)", () => {
    it("deleteWaypoint removes the waypoint and pushes ONE history patch", () => {
      const h = makeHarness(
        sceneWith(
          horizontalLink({
            waypoints: [
              { x: 50, y: 50 },
              { x: 150, y: 50 },
            ],
          }),
        ),
      );
      h.c.deleteWaypoint(L, 0);
      expect(getLink(h.host.scene, L)?.waypoints).toEqual([{ x: 150, y: 50 }]);
      expect(h.pushed).toHaveLength(1);
    });

    it("deleteWaypoint with an out-of-range index is a no-op", () => {
      const h = makeHarness(sceneWith(horizontalLink({ waypoints: [{ x: 50, y: 50 }] })));
      h.c.deleteWaypoint(L, 5);
      expect(getLink(h.host.scene, L)?.waypoints).toHaveLength(1);
      expect(h.pushed).toHaveLength(0);
    });

    it("resetSegmentPin removes the matching pinned segment (axis + nearest pos)", () => {
      const h = makeHarness(
        sceneWith(
          horizontalLink({
            fixedSegments: [
              { axis: "h", pos: 60, at: 100 },
              { axis: "v", pos: 10, at: 50 },
            ],
          }),
        ),
      );
      h.c.resetSegmentPin(L, "h", 60, 100);
      expect(getLink(h.host.scene, L)?.fixedSegments).toEqual([{ axis: "v", pos: 10, at: 50 }]);
      expect(h.pushed).toHaveLength(1);
    });

    it("resetSegmentPin with no matching axis is a no-op", () => {
      const h = makeHarness(
        sceneWith(horizontalLink({ fixedSegments: [{ axis: "v", pos: 10, at: 50 }] })),
      );
      h.c.resetSegmentPin(L, "h", 60, 100);
      expect(getLink(h.host.scene, L)?.fixedSegments).toHaveLength(1);
      expect(h.pushed).toHaveLength(0);
    });
  });

  it("reset() drops all drag state without committing", () => {
    const h = makeHarness(sceneWith(horizontalLink({ waypoints: [{ x: 100, y: 50 }] })));
    h.c.beginWaypointDrag(L, 0, false);
    h.c.beginSegmentDrag(L, "h", 100);
    h.c.applyEndpointMove(L, "to", { x: 300, y: 150 });
    h.c.reset();
    expect(h.c.waypointDrag).toBeNull();
    expect(h.c.segmentDrag).toBeNull();
    expect(h.c.endpointDrag).toBeNull();
    expect(h.commitGesture).not.toHaveBeenCalled();
  });
});
