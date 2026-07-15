/**
 * Bend/segment handles vs the caption pill: a handle whose natural position
 * (span midpoint) lands under the label pill slides along its span to just
 * outside the pill, so both stay usable.
 */
import { describe, expect, it } from "vitest";
import { linkId, layerId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addLink,
  emptyScene,
  getElbowSegmentHandles,
  getLinkWaypointMidpoints,
  linkLabelBounds,
  nudgeHandleOffLabel,
  orderBetween,
  type Link,
  type Scene,
} from "../src/index";

const edge = (overrides: Partial<Link>): Link => ({
  id: linkId("e1"),
  layerId: layerId(DEFAULT_LAYER_ID),
  from: { kind: "point", position: { x: 0, y: 0 } },
  to: { kind: "point", position: { x: 200, y: 0 } },
  order: orderBetween(null, null),
  style: { stroke: "#000" },
  ...overrides,
});

const sceneWith = (e: Link): Scene => addLink(emptyScene(), e).scene;

const inside = (
  p: { x: number; y: number },
  b: { x: number; y: number; width: number; height: number },
) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

describe("nudgeHandleOffLabel", () => {
  const lerp = (t: number) => ({ x: 200 * t, y: 0 });

  it("returns the plain midpoint without a label", () => {
    expect(nudgeHandleOffLabel(lerp, null)).toEqual({ x: 100, y: 0 });
  });

  it("slides the point to the nearest sample outside the pill", () => {
    const pill = { x: 80, y: -10, width: 40, height: 20 };
    const p = nudgeHandleOffLabel(lerp, pill);
    expect(inside(p, pill)).toBe(false);
    expect(p.y).toBe(0); // stays on the span
  });

  it("degenerates to the midpoint when the whole span is covered", () => {
    const pill = { x: -10, y: -10, width: 220, height: 20 };
    expect(nudgeHandleOffLabel(lerp, pill)).toEqual({ x: 100, y: 0 });
  });
});

describe("getLinkWaypointMidpoints — label avoidance", () => {
  it("an unlabelled straight link keeps the exact midpoint", () => {
    const e = edge({});
    const mids = getLinkWaypointMidpoints(sceneWith(e), e)!;
    expect(mids).toEqual([{ x: 100, y: 0 }]);
  });

  it("a labelled straight link slides its add-handle out of the pill", () => {
    const e = edge({ label: { text: "hey" } });
    const s = sceneWith(e);
    const pill = linkLabelBounds(s, e)!;
    const mids = getLinkWaypointMidpoints(s, e)!;
    expect(mids).toHaveLength(1);
    expect(inside(mids[0]!, pill)).toBe(false);
    expect(mids[0]!.y).toBe(0); // still on the line
  });
});

describe("getElbowSegmentHandles — label avoidance", () => {
  it("routed chain exposes interior segments with 1:1 k-indexing", () => {
    const e = edge({ routing: "orthogonal" });
    const s = sceneWith(e);
    const handles = getElbowSegmentHandles(s, e, [
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 100 },
    ]);
    expect(handles.map((h) => h.k)).toEqual([1]);
    expect(handles[0]!.point).toEqual({ x: 150, y: 50 }); // no label → plain midpoint
  });

  it("a straight (2-point) elbow exposes its single segment handle", () => {
    const e = edge({ routing: "orthogonal" });
    const s = sceneWith(e);
    const handles = getElbowSegmentHandles(s, e, [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ]);
    expect(handles.map((h) => h.k)).toEqual([0]);
  });
});
