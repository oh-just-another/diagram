import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import type { Vec2 } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  findNearestOutlinePoint,
  getOutlinePoint,
  getOutlineSampler,
  orderBetween,
  registerOutlineSampler,
  type ElementBase,
  type PolygonElement,
} from "../src/index";

const polygon = (points: readonly Vec2[], position = { x: 0, y: 0 }): PolygonElement => ({
  id: elementId("p1"),
  layerId: DEFAULT_LAYER_ID,
  type: "polygon",
  position,
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  points,
});

describe("outline sampler registry", () => {
  it("getOutlineSampler returns a registered built-in", () => {
    expect(getOutlineSampler("rectangle")).toBeTypeOf("function");
    expect(getOutlineSampler("ellipse")).toBeTypeOf("function");
    expect(getOutlineSampler("polygon")).toBeTypeOf("function");
  });

  it("getOutlineSampler returns undefined for an unknown type", () => {
    expect(getOutlineSampler("__no_such_type__")).toBeUndefined();
  });

  it("getOutlinePoint throws for a shape type without a sampler", () => {
    const unknown = {
      id: elementId("u"),
      layerId: DEFAULT_LAYER_ID,
      type: "__unknown_shape__",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
    } as unknown as ElementBase;
    expect(() => getOutlinePoint(unknown, 0.5)).toThrow(/No outline sampler/);
  });

  it("findNearestOutlinePoint returns null for a shape type without a sampler", () => {
    const unknown = {
      id: elementId("u"),
      layerId: DEFAULT_LAYER_ID,
      type: "__unknown_shape2__",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
    } as unknown as ElementBase;
    expect(findNearestOutlinePoint(unknown, { x: 0, y: 0 })).toBeNull();
  });

  it("registerOutlineSampler lets a custom type participate", () => {
    registerOutlineSampler("__custom_outline__", () => ({ x: 7, y: 9 }));
    const shape = {
      id: elementId("c"),
      layerId: DEFAULT_LAYER_ID,
      type: "__custom_outline__",
      position: { x: 1, y: 1 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
    } as unknown as ElementBase;
    // localToWorld adds the position (no rotation / unit scale).
    expect(getOutlinePoint(shape, 0.5)).toEqual({ x: 8, y: 10 });
  });
});

describe("polygon outline sampler — samplePolyline edge cases", () => {
  it("traces a triangle's perimeter (multi-point path)", () => {
    const tri = polygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ]);
    // Ratio 0 = first vertex.
    expect(getOutlinePoint(tri, 0)).toEqual({ x: 0, y: 0 });
    // Perimeter ≈ 34.14 (10 + √200 + 10); ratio 0.25 → ≈8.54 along the first
    // edge (0,0)→(10,0), so still on the bottom edge at y=0.
    const mid = getOutlinePoint(tri, 0.25);
    expect(mid.x).toBeCloseTo(8.5355, 3);
    expect(mid.y).toBeCloseTo(0);
  });

  it("empty points → fixed (0,0) local, translated to world", () => {
    const empty = polygon([], { x: 100, y: 50 });
    // samplePolyline returns {0,0}; localToWorld adds position.
    expect(getOutlinePoint(empty, 0.5)).toEqual({ x: 100, y: 50 });
  });

  it("single point → that point regardless of ratio", () => {
    const single = polygon([{ x: 3, y: 4 }], { x: 10, y: 10 });
    expect(getOutlinePoint(single, 0)).toEqual({ x: 13, y: 14 });
    expect(getOutlinePoint(single, 0.9)).toEqual({ x: 13, y: 14 });
  });

  it("degenerate polygon with coincident points (total perimeter 0) returns the first point", () => {
    const degenerate = polygon([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]);
    // total === 0 branch → first point.
    expect(getOutlinePoint(degenerate, 0.5)).toEqual({ x: 5, y: 5 });
  });

  it("findNearestOutlinePoint on a single-point polygon collapses to that point", () => {
    const single = polygon([{ x: 0, y: 0 }], { x: 20, y: 20 });
    const found = findNearestOutlinePoint(single, { x: 100, y: 100 })!;
    expect(found).not.toBeNull();
    expect(found.world).toEqual({ x: 20, y: 20 });
    // All samples coincide → best stays ratio 0.
    expect(found.ratio).toBe(0);
  });

  it("findNearestOutlinePoint honours a custom sample count", () => {
    const tri = polygon([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 0, y: 40 },
    ]);
    const found = findNearestOutlinePoint(tri, { x: 20, y: -5 }, 8)!;
    expect(found).not.toBeNull();
    // Nearest point sits along the top edge, near x=20, y=0.
    expect(found.world.y).toBeCloseTo(0, 0);
  });
});
