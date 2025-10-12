import { describe, expect, it } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import {
  STANDARD_ANCHORS,
  STANDARD_ANCHOR_RATIOS,
  CARDINAL_ANCHORS,
  getAnchorLocal,
  getAnchorWorld,
  getNamedAnchorLocal,
  listAnchorsLocal,
  geometryDefaultAnchorsLocal,
  orderBetween,
  type RectangleElement,
  type PolygonElement,
  type EllipseElement,
} from "../src/index";

const baseRect = (overrides: Partial<RectangleElement> = {}): RectangleElement => ({
  id: elementId("r1"),
  layerId: layerId("default"),
  type: "rectangle",
  position: { x: 100, y: 200 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#abc" },
  width: 200,
  height: 100,
  ...overrides,
});

describe("STANDARD_ANCHORS", () => {
  it("lists 9 canonical names in clockwise-from-top-left order", () => {
    expect(STANDARD_ANCHORS).toEqual([
      "top-left",
      "top",
      "top-right",
      "right",
      "bottom-right",
      "bottom",
      "bottom-left",
      "left",
      "center",
    ]);
  });

  it("ratios cover the full 0..1 grid", () => {
    expect(STANDARD_ANCHOR_RATIOS.center).toEqual({ x: 0.5, y: 0.5 });
    expect(STANDARD_ANCHOR_RATIOS["top-left"]).toEqual({ x: 0, y: 0 });
    expect(STANDARD_ANCHOR_RATIOS["bottom-right"]).toEqual({ x: 1, y: 1 });
  });
});

describe("getNamedAnchorLocal", () => {
  it("resolves the 4 corners + 4 edge midpoints + center", () => {
    const r = baseRect();
    expect(getNamedAnchorLocal(r, "top-left")).toEqual({ x: 0, y: 0 });
    expect(getNamedAnchorLocal(r, "top")).toEqual({ x: 100, y: 0 });
    expect(getNamedAnchorLocal(r, "top-right")).toEqual({ x: 200, y: 0 });
    expect(getNamedAnchorLocal(r, "right")).toEqual({ x: 200, y: 50 });
    expect(getNamedAnchorLocal(r, "bottom-right")).toEqual({ x: 200, y: 100 });
    expect(getNamedAnchorLocal(r, "bottom")).toEqual({ x: 100, y: 100 });
    expect(getNamedAnchorLocal(r, "bottom-left")).toEqual({ x: 0, y: 100 });
    expect(getNamedAnchorLocal(r, "left")).toEqual({ x: 0, y: 50 });
    expect(getNamedAnchorLocal(r, "center")).toEqual({ x: 100, y: 50 });
  });

  it("returns undefined for unknown names without a custom anchor", () => {
    expect(getNamedAnchorLocal(baseRect(), "made-up")).toBeUndefined();
  });

  it("custom anchor overrides the standard placement", () => {
    const r = baseRect({
      anchors: {
        center: { kind: "ratio", position: { x: 0.25, y: 0.25 } },
      },
    });
    expect(getNamedAnchorLocal(r, "center")).toEqual({ x: 50, y: 25 });
  });

  it("custom anchor adds a brand-new port name", () => {
    const r = baseRect({
      anchors: {
        "label-slot": { kind: "absolute", offset: { x: 12, y: 12 } },
      },
    });
    expect(getNamedAnchorLocal(r, "label-slot")).toEqual({ x: 12, y: 12 });
  });
});

describe("getAnchorLocal", () => {
  it("resolves ratio refs against the local bounds", () => {
    const r = baseRect();
    expect(getAnchorLocal(r, { kind: "ratio", position: { x: 0.25, y: 0.75 } })).toEqual({
      x: 50,
      y: 75,
    });
  });

  it("resolves absolute refs as a plain pixel offset", () => {
    const r = baseRect();
    expect(getAnchorLocal(r, { kind: "absolute", offset: { x: 17, y: 5 } })).toEqual({
      x: 17,
      y: 5,
    });
  });

  it("throws with a helpful message when a named ref points nowhere", () => {
    expect(() => getAnchorLocal(baseRect(), { kind: "named", name: "x" })).toThrow(
      /Unknown anchor "x"/,
    );
  });
});

describe("getAnchorWorld", () => {
  it("translates by `position` for an unrotated, unscaled shape", () => {
    const r = baseRect();
    expect(getAnchorWorld(r, { kind: "named", name: "center" })).toEqual({ x: 200, y: 250 });
    expect(getAnchorWorld(r, { kind: "named", name: "top-left" })).toEqual({ x: 100, y: 200 });
  });

  it("scales the local point before translation", () => {
    const r = baseRect({ scale: { x: 2, y: 0.5 } });
    expect(getAnchorWorld(r, { kind: "named", name: "bottom-right" })).toEqual({
      x: 100 + 200 * 2,
      y: 200 + 100 * 0.5,
    });
  });

  it("rotates by the shape's rotation around `position`", () => {
    // 90deg CCW: local (100, 0) becomes (0, 100) in the world frame.
    const r = baseRect({ rotation: Math.PI / 2 });
    const p = getAnchorWorld(r, { kind: "named", name: "top" });
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(200 + 100, 6);
  });
});

describe("listAnchorsLocal", () => {
  it("returns every standard anchor by default", () => {
    const out = listAnchorsLocal(baseRect());
    expect(out.size).toBe(STANDARD_ANCHORS.length);
    expect(out.get("center")).toEqual({ x: 100, y: 50 });
  });

  it("merges custom anchors on top of the standard set", () => {
    const r = baseRect({
      anchors: {
        center: { kind: "ratio", position: { x: 0, y: 0 } }, // override
        "label-slot": { kind: "absolute", offset: { x: 10, y: 10 } }, // addition
      },
    });
    const out = listAnchorsLocal(r);
    expect(out.size).toBe(STANDARD_ANCHORS.length + 1);
    expect(out.get("center")).toEqual({ x: 0, y: 0 });
    expect(out.get("label-slot")).toEqual({ x: 10, y: 10 });
  });
});

const baseEllipse = (overrides: Partial<EllipseElement> = {}): EllipseElement => ({
  id: elementId("e1"),
  layerId: layerId("default"),
  type: "ellipse",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#abc" },
  width: 200,
  height: 100,
  ...overrides,
});

// A right triangle whose hypotenuse is a sloped edge — the case the
// AABB-relative `left`/`right` anchors get wrong (they sit on the bbox,
// not on the sloped edge). Local coords, origin at `position`.
const baseTriangle = (overrides: Partial<PolygonElement> = {}): PolygonElement => ({
  id: elementId("t1"),
  layerId: layerId("default"),
  type: "polygon",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#abc" },
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
  ],
  ...overrides,
});

describe("CARDINAL_ANCHORS", () => {
  it("is the four edge centres, no corners or center", () => {
    expect(CARDINAL_ANCHORS).toEqual(["top", "right", "bottom", "left"]);
  });
});

describe("geometryDefaultAnchorsLocal", () => {
  it("returns the 4 edge centres for a rectangle — no corners, no center", () => {
    const out = geometryDefaultAnchorsLocal(baseRect());
    expect([...out.keys()].sort()).toEqual(["bottom", "left", "right", "top"]);
    expect(out.get("top")).toEqual({ x: 100, y: 0 });
    expect(out.get("right")).toEqual({ x: 200, y: 50 });
    expect(out.get("bottom")).toEqual({ x: 100, y: 100 });
    expect(out.get("left")).toEqual({ x: 0, y: 50 });
    expect(out.has("center")).toBe(false);
    expect(out.has("top-left")).toBe(false);
  });

  it("returns the 4 cardinal points for an ellipse (on the bbox edge centres)", () => {
    const out = geometryDefaultAnchorsLocal(baseEllipse());
    expect([...out.keys()].sort()).toEqual(["bottom", "left", "right", "top"]);
    expect(out.get("top")).toEqual({ x: 100, y: 0 });
    expect(out.get("right")).toEqual({ x: 200, y: 50 });
  });

  it("returns the midpoint of every edge for a polygon (on the real edges)", () => {
    const out = geometryDefaultAnchorsLocal(baseTriangle());
    // 3 edges → 3 midpoints, keyed edge-0..edge-2 in vertex order.
    expect([...out.keys()].sort()).toEqual(["edge-0", "edge-1", "edge-2"]);
    // edge-0: (0,0)->(100,0) midpoint = (50,0) — top edge
    expect(out.get("edge-0")).toEqual({ x: 50, y: 0 });
    // edge-1: (100,0)->(0,100) midpoint = (50,50) — ON the hypotenuse,
    // NOT on the bbox right edge (which would be x=100).
    expect(out.get("edge-1")).toEqual({ x: 50, y: 50 });
    // edge-2: (0,100)->(0,0) midpoint = (0,50) — left edge
    expect(out.get("edge-2")).toEqual({ x: 0, y: 50 });
    expect(out.has("center")).toBe(false);
  });

  it("merges custom shape.anchors on top of the geometry defaults", () => {
    const out = geometryDefaultAnchorsLocal(
      baseRect({
        anchors: {
          top: { kind: "ratio", position: { x: 0, y: 0 } }, // override default `top`
          "label-slot": { kind: "absolute", offset: { x: 12, y: 12 } }, // addition
        },
      }),
    );
    expect(out.get("top")).toEqual({ x: 0, y: 0 }); // overridden
    expect(out.get("label-slot")).toEqual({ x: 12, y: 12 }); // added
    expect(out.get("right")).toEqual({ x: 200, y: 50 }); // default kept
  });

  it("ignores a degenerate polygon with fewer than 2 points (only customs)", () => {
    const out = geometryDefaultAnchorsLocal(baseTriangle({ points: [{ x: 0, y: 0 }] }));
    expect(out.size).toBe(0);
  });

  it("does not change listAnchorsLocal (still the 9 standard anchors)", () => {
    expect(listAnchorsLocal(baseRect()).size).toBe(STANDARD_ANCHORS.length);
    expect(STANDARD_ANCHOR_RATIOS.top).toEqual({ x: 0.5, y: 0 });
  });
});
