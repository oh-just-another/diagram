import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  getElement,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { computeRotatedElementResize } from "../src/editor/applies/resize.js";

// 40×40 rect at world origin, rotated +90° (CCW). The renderer pivots about
// `position` (top-left), so the box occupies world x∈[−40,0], y∈[0,40]:
//   local (0,0)   → (0,0)     [NW]
//   local (40,0)  → (0,40)    [NE]
//   local (40,40) → (−40,40)  [SE]
//   local (0,40)  → (−40,0)   [SW]
const rotatedRect = (): Element => ({
  id: elementId("r"),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: Math.PI / 2,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 40,
  height: 40,
});

const sceneWith = (shape: Element): Scene => addElement(emptyScene(), shape).scene;

// World position of a shape's local corner: position + Rot(θ)·(local).
const cornerWorld = (s: Element, lx: number, ly: number) => {
  const cos = Math.cos(s.rotation);
  const sin = Math.sin(s.rotation);
  return { x: s.position.x + (lx * cos - ly * sin), y: s.position.y + (lx * sin + ly * cos) };
};

describe("computeRotatedElementResize (closed-form, opposite corner fixed in world)", () => {
  it("dragging SE grows the box and keeps the NW corner fixed", () => {
    const shape = rotatedRect();
    const scene = sceneWith(shape);
    // localDelta = (worldDelta·u, worldDelta·v) with u=(0,1), v=(−1,0).
    // Want local (+20 width, +10 height) → worldDelta = (−10, 20).
    const result = computeRotatedElementResize(scene, shape, "se", { x: -10, y: 20 });
    expect(result).not.toBeNull();
    const next = getElement(result!.scene, shape.id) as Element & {
      width: number;
      height: number;
    };
    expect(next.width).toBeCloseTo(60, 5);
    expect(next.height).toBeCloseTo(50, 5);
    expect(next.rotation).toBeCloseTo(Math.PI / 2, 10);
    // NW (local 0,0 = position) stays at world (0,0).
    expect(next.position.x).toBeCloseTo(0, 5);
    expect(next.position.y).toBeCloseTo(0, 5);
  });

  it("dragging NW shrinks the box and keeps the SE corner fixed in world", () => {
    const shape = rotatedRect();
    const scene = sceneWith(shape);
    // The SE corner before resize.
    const seBefore = cornerWorld(shape, 40, 40); // (−40, 40)
    // local (−10 each on x/y origin → shrink 10×10) → worldDelta = (−10, 10).
    const result = computeRotatedElementResize(scene, shape, "nw", { x: -10, y: 10 });
    expect(result).not.toBeNull();
    const next = getElement(result!.scene, shape.id) as Element & {
      width: number;
      height: number;
    };
    expect(next.width).toBeCloseTo(30, 5);
    expect(next.height).toBeCloseTo(30, 5);
    // SE corner (local w,h) must not have moved in world.
    const seAfter = cornerWorld(next, next.width, next.height);
    expect(seAfter.x).toBeCloseTo(seBefore.x, 5);
    expect(seAfter.y).toBeCloseTo(seBefore.y, 5);
  });

  it("alt (fromCenter) keeps the box centre fixed in world", () => {
    const shape = rotatedRect();
    const scene = sceneWith(shape);
    const centreBefore = cornerWorld(shape, 20, 20); // local centre → world
    const result = computeRotatedElementResize(scene, shape, "se", { x: -10, y: 20 }, false, true);
    expect(result).not.toBeNull();
    const next = getElement(result!.scene, shape.id) as Element & {
      width: number;
      height: number;
    };
    const centreAfter = cornerWorld(next, next.width / 2, next.height / 2);
    expect(centreAfter.x).toBeCloseTo(centreBefore.x, 5);
    expect(centreAfter.y).toBeCloseTo(centreBefore.y, 5);
  });
});
