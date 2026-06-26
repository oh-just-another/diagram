import { describe, expect, it } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import type { Vec2 } from "@oh-just-another/types";
import { orderBetween } from "../src/index";
import type { ElementBase } from "../src/shape";
import { localToWorld } from "../src/shape-transform";

/**
 * Minimal `ElementBase` fixture. `localToWorld` only reads `position`,
 * `rotation` and `scale`, so the rest are filled with inert defaults.
 */
const makeShape = (overrides: {
  position?: Vec2;
  rotation?: number;
  scale?: Vec2;
}): ElementBase => ({
  id: elementId("s"),
  layerId: layerId("L"),
  type: "rectangle",
  position: overrides.position ?? { x: 0, y: 0 },
  rotation: overrides.rotation ?? 0,
  scale: overrides.scale ?? { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
});

describe("localToWorld", () => {
  it("identity transform returns the local point unchanged", () => {
    const shape = makeShape({});
    const out = localToWorld(shape, { x: 3, y: -7 });
    expect(out.x).toBeCloseTo(3);
    expect(out.y).toBeCloseTo(-7);
  });

  it("pure translation shifts the point by position", () => {
    const shape = makeShape({ position: { x: 10, y: 5 } });
    const out = localToWorld(shape, { x: 2, y: 3 });
    expect(out.x).toBeCloseTo(12);
    expect(out.y).toBeCloseTo(8);
  });

  it("pure scale multiplies each axis independently", () => {
    const shape = makeShape({ scale: { x: 2, y: 3 } });
    const out = localToWorld(shape, { x: 4, y: 5 });
    expect(out.x).toBeCloseTo(8);
    expect(out.y).toBeCloseTo(15);
  });

  it("pure 90deg rotation maps (1, 0) to (0, 1) about the origin", () => {
    const shape = makeShape({ rotation: Math.PI / 2 });
    const out = localToWorld(shape, { x: 1, y: 0 });
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(1);
  });

  it("pure 90deg rotation maps (0, 1) to (-1, 0)", () => {
    const shape = makeShape({ rotation: Math.PI / 2 });
    const out = localToWorld(shape, { x: 0, y: 1 });
    expect(out.x).toBeCloseTo(-1);
    expect(out.y).toBeCloseTo(0);
  });

  it("rotation happens about the origin, then translation is applied", () => {
    // 90deg rotation sends (1, 0) -> (0, 1); translating by (5, 5) -> (5, 6).
    const shape = makeShape({ rotation: Math.PI / 2, position: { x: 5, y: 5 } });
    const out = localToWorld(shape, { x: 1, y: 0 });
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(6);
  });

  it("combined scale, rotation, and translation compose in scale->rotate->translate order", () => {
    // local (1, 0) -> scale x2 -> (2, 0) -> rotate 90deg -> (0, 2) -> +(1, 1) -> (1, 3)
    const shape = makeShape({
      scale: { x: 2, y: 2 },
      rotation: Math.PI / 2,
      position: { x: 1, y: 1 },
    });
    const out = localToWorld(shape, { x: 1, y: 0 });
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(3);
  });

  it("the origin (0, 0) always maps to the shape position", () => {
    const shape = makeShape({
      scale: { x: 5, y: 9 },
      rotation: 1.234,
      position: { x: -2, y: 8 },
    });
    const out = localToWorld(shape, { x: 0, y: 0 });
    expect(out.x).toBeCloseTo(-2);
    expect(out.y).toBeCloseTo(8);
  });
});
