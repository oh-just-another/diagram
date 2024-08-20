import { describe, expect, it } from "vitest";
import { layerId, shapeId } from "@oh-just-another/types";
import {
  STANDARD_ANCHORS,
  STANDARD_ANCHOR_RATIOS,
  getAnchorLocal,
  getAnchorWorld,
  getNamedAnchorLocal,
  listAnchorsLocal,
  orderBetween,
  type RectangleShape,
} from "../src/index";

const baseRect = (overrides: Partial<RectangleShape> = {}): RectangleShape => ({
  id: shapeId("r1"),
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
