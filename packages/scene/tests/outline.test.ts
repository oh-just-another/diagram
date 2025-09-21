import { describe, expect, it } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  findNearestOutlinePoint,
  getOutlinePoint,
  orderBetween,
  type RectangleShape,
} from "../src/index";

const rect = (overrides: Partial<RectangleShape> = {}): RectangleShape => ({
  id: elementId("r1"),
  layerId: layerId(DEFAULT_LAYER_ID),
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#fff" },
  width: 100,
  height: 80,
  ...overrides,
});

describe("getOutlinePoint (rectangle)", () => {
  it("ratio 0 = top-left corner in world space", () => {
    expect(getOutlinePoint(rect({ position: { x: 10, y: 20 } }), 0)).toEqual({ x: 10, y: 20 });
  });

  it("ratio 0.25 = top-right corner (quarter of the perimeter)", () => {
    // Perimeter = 2*(100+80) = 360. Quarter = 90 → top side is 100,
    // so 90 lands 90/100 along the top edge = (90, 0).
    const p = getOutlinePoint(rect(), 0.25);
    expect(p.x).toBeCloseTo(90);
    expect(p.y).toBeCloseTo(0);
  });

  it("ratio 0.5 = bottom-right corner ish", () => {
    // Half perimeter = 180 — top (100) + right (80) = 180.
    expect(getOutlinePoint(rect(), 0.5)).toEqual({ x: 100, y: 80 });
  });

  it("ratio 1 wraps to ratio 0", () => {
    expect(getOutlinePoint(rect(), 1)).toEqual({ x: 0, y: 0 });
  });
});

describe("getOutlinePoint (ellipse)", () => {
  const ellipse = {
    ...rect(),
    type: "ellipse" as const,
  };

  it("ratio 0 = top of the bounding box", () => {
    const p = getOutlinePoint(ellipse, 0);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(0);
  });

  it("ratio 0.5 = bottom", () => {
    const p = getOutlinePoint(ellipse, 0.5);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(80);
  });
});

describe("findNearestOutlinePoint", () => {
  it("snaps a point near the right edge to that edge", () => {
    const r = rect();
    const found = findNearestOutlinePoint(r, { x: 105, y: 40 });
    expect(found).not.toBeNull();
    // Discretization (64 samples) puts the snap within ~1 px of the
    // probe along the long edge; that's plenty for visual snap UX.
    expect(found!.world.x).toBeCloseTo(100, 0);
    expect(Math.abs(found!.world.y - 40)).toBeLessThan(1);
  });

  it("returned ratio can be persisted and resolved back to the same point", () => {
    const r = rect({ position: { x: 200, y: 100 } });
    const found = findNearestOutlinePoint(r, { x: 305, y: 130 })!;
    const restored = getOutlinePoint(r, found.ratio);
    expect(restored.x).toBeCloseTo(found.world.x);
    expect(restored.y).toBeCloseTo(found.world.y);
  });

  it("tracks shape movement — outline point follows when the shape moves", () => {
    const r = rect({ position: { x: 0, y: 0 } });
    const found = findNearestOutlinePoint(r, { x: 100, y: 40 })!; // right edge mid
    const moved: RectangleShape = { ...r, position: { x: 500, y: 500 } };
    const after = getOutlinePoint(moved, found.ratio);
    // Same discretization tolerance as above — point follows the move
    // within sampling error.
    expect(after.x).toBeCloseTo(600, 0);
    expect(Math.abs(after.y - 540)).toBeLessThan(1);
  });
});
