import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  getElement,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { anchorOverlayPoints } from "../src/editor/anchor-points.js";

const rect = (id: string, x = 0, y = 0, w = 100, h = 100): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: w,
  height: h,
});

const makeShape = (): Element => {
  let s = emptyScene();
  ({ scene: s } = addElement(s, rect("r")));
  return getElement(s, elementId("r"))!;
};

describe("anchorOverlayPoints (shared overlay/hit geometry)", () => {
  it("returns one world point per named anchor", () => {
    const shape = makeShape();
    const { names, worldPoints } = anchorOverlayPoints(shape, 0);
    expect(names.length).toBeGreaterThan(0);
    expect(worldPoints.length).toBe(names.length);
  });

  it("with zero outset the dots sit on the element's bounds", () => {
    const shape = makeShape();
    const { worldPoints } = anchorOverlayPoints(shape, 0);
    for (const p of worldPoints) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });

  it("a positive outset pushes every dot outward from the element centre", () => {
    const shape = makeShape();
    const base = anchorOverlayPoints(shape, 0).worldPoints;
    const out = anchorOverlayPoints(shape, 10).worldPoints;
    expect(out.length).toBe(base.length);
    const cx = 50;
    const cy = 50;
    for (let i = 0; i < base.length; i++) {
      const d0 = Math.hypot(base[i]!.x - cx, base[i]!.y - cy);
      const d1 = Math.hypot(out[i]!.x - cx, out[i]!.y - cy);
      // Each dot moves strictly farther from the centre — the standard
      // floating-port offset. (No anchor sits exactly at the centre, so
      // the outward normal is always well-defined for a rectangle.)
      expect(d1).toBeGreaterThan(d0);
    }
  });
});
