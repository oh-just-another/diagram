import { describe, expect, it } from "vitest";
import { ellipseOutlinePoint } from "../src/ellipse";

describe("ellipseOutlinePoint", () => {
  describe("clock positions on a circle (cx=10, cy=20, r=5)", () => {
    const cx = 10;
    const cy = 20;
    const r = 5;

    it("ratio 0 -> top (12 o'clock): (cx, cy - r)", () => {
      const p = ellipseOutlinePoint(cx, cy, r, r, 0);
      expect(p.x).toBeCloseTo(cx);
      expect(p.y).toBeCloseTo(cy - r);
    });

    it("ratio 0.25 -> right (3 o'clock): (cx + r, cy)", () => {
      const p = ellipseOutlinePoint(cx, cy, r, r, 0.25);
      expect(p.x).toBeCloseTo(cx + r);
      expect(p.y).toBeCloseTo(cy);
    });

    it("ratio 0.5 -> bottom (6 o'clock): (cx, cy + r)", () => {
      const p = ellipseOutlinePoint(cx, cy, r, r, 0.5);
      expect(p.x).toBeCloseTo(cx);
      expect(p.y).toBeCloseTo(cy + r);
    });

    it("ratio 0.75 -> left (9 o'clock): (cx - r, cy)", () => {
      const p = ellipseOutlinePoint(cx, cy, r, r, 0.75);
      expect(p.x).toBeCloseTo(cx - r);
      expect(p.y).toBeCloseTo(cy);
    });

    it("ratio 1 wraps back to the top, equal to ratio 0", () => {
      const start = ellipseOutlinePoint(cx, cy, r, r, 0);
      const end = ellipseOutlinePoint(cx, cy, r, r, 1);
      expect(end.x).toBeCloseTo(start.x);
      expect(end.y).toBeCloseTo(start.y);
    });
  });

  describe("non-circular ellipse uses rx for x and ry for y (cx=0, cy=0, rx=8, ry=3)", () => {
    const rx = 8;
    const ry = 3;

    it("ratio 0 -> top uses ry on the y axis: (0, -ry)", () => {
      const p = ellipseOutlinePoint(0, 0, rx, ry, 0);
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(-ry);
    });

    it("ratio 0.25 -> right uses rx on the x axis: (rx, 0)", () => {
      const p = ellipseOutlinePoint(0, 0, rx, ry, 0.25);
      expect(p.x).toBeCloseTo(rx);
      expect(p.y).toBeCloseTo(0);
    });

    it("ratio 0.5 -> bottom: (0, ry)", () => {
      const p = ellipseOutlinePoint(0, 0, rx, ry, 0.5);
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(ry);
    });

    it("a 45deg-ish ratio (0.125) traces toward the upper-right with distinct rx/ry scaling", () => {
      // angle = 0.125 * 2pi - pi/2 = -pi/4, so cos=sin=±√2/2.
      const half = Math.SQRT1_2;
      const p = ellipseOutlinePoint(0, 0, rx, ry, 0.125);
      expect(p.x).toBeCloseTo(rx * half);
      expect(p.y).toBeCloseTo(-ry * half);
    });
  });

  it("respects the center offset (cx, cy)", () => {
    const p = ellipseOutlinePoint(100, 200, 4, 4, 0.25);
    expect(p.x).toBeCloseTo(104);
    expect(p.y).toBeCloseTo(200);
  });

  it("all outline points of a circle lie at radius r from the center", () => {
    const cx = 3;
    const cy = -2;
    const r = 7;
    for (let i = 0; i <= 8; i++) {
      const ratio = i / 8;
      const p = ellipseOutlinePoint(cx, cy, r, r, ratio);
      const dist = Math.hypot(p.x - cx, p.y - cy);
      expect(dist).toBeCloseTo(r);
    }
  });
});
