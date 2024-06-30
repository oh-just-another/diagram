import { describe, expect, it } from "vitest";
import * as intersect from "../src/intersect.js";

const close = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) < eps;

describe("intersect", () => {
  describe("lineLine", () => {
    it("returns intersection of perpendicular axes", () => {
      const p = intersect.lineLine(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: -5 },
        { x: 5, y: 5 },
      );
      expect(p).not.toBeNull();
      expect(p!.x).toBe(5);
      expect(p!.y).toBe(0);
    });
    it("returns null for parallel lines", () => {
      const p = intersect.lineLine(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 1 },
        { x: 10, y: 1 },
      );
      expect(p).toBeNull();
    });
    it("extends beyond segments (intersection outside endpoints)", () => {
      const p = intersect.lineLine(
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 100, y: -1 },
        { x: 100, y: 1 },
      );
      expect(p).not.toBeNull();
      expect(p!.x).toBe(100);
      expect(p!.y).toBe(0);
    });
  });

  describe("segmentSegment", () => {
    it("returns intersection when segments cross", () => {
      const p = intersect.segmentSegment(
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      );
      expect(p).not.toBeNull();
      expect(close(p!.x, 5)).toBe(true);
      expect(close(p!.y, 5)).toBe(true);
    });
    it("returns null when segments would intersect only if extended", () => {
      const p = intersect.segmentSegment(
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 100, y: -1 },
        { x: 100, y: 1 },
      );
      expect(p).toBeNull();
    });
    it("returns null for parallel segments", () => {
      const p = intersect.segmentSegment(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 1 },
        { x: 10, y: 1 },
      );
      expect(p).toBeNull();
    });
  });

  describe("segmentQuadratic", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 5, y: 10 };
    const p2 = { x: 10, y: 0 };

    it("horizontal line through apex (double root) returns 1 or 2 coincident points", () => {
      const apexY = 5; // quadratic peak for these control points
      const pts = intersect.segmentQuadratic({ x: -1, y: apexY }, { x: 11, y: apexY }, p0, p1, p2);
      // Numerically the double root may collapse to one root or two near-equal roots.
      expect(pts.length).toBeGreaterThanOrEqual(1);
      for (const p of pts) expect(close(p.y, apexY, 1e-6)).toBe(true);
      for (const p of pts) expect(close(p.x, 5, 1e-6)).toBe(true);
    });
    it("line through chord returns two points", () => {
      const pts = intersect.segmentQuadratic({ x: -1, y: 2 }, { x: 11, y: 2 }, p0, p1, p2);
      expect(pts).toHaveLength(2);
    });
    it("line entirely below the curve returns no intersection", () => {
      const pts = intersect.segmentQuadratic({ x: -1, y: -1 }, { x: 11, y: -1 }, p0, p1, p2);
      expect(pts).toHaveLength(0);
    });
  });

  describe("segmentCubic", () => {
    it("vertical line through center hits the apex once", () => {
      const pts = intersect.segmentCubic(
        { x: 5, y: -1 },
        { x: 5, y: 100 },
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
      );
      expect(pts.length).toBeGreaterThanOrEqual(1);
      // Apex of this symmetric S-curve is at (5, 7.5).
      expect(pts.some((p) => Math.abs(p.x - 5) < 0.1 && Math.abs(p.y - 7.5) < 0.5)).toBe(true);
    });
    it("horizontal line crossing both sides returns two intersections", () => {
      const pts = intersect.segmentCubic(
        { x: -1, y: 5 },
        { x: 11, y: 5 },
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
      );
      // y(t) = 30t(1-t) peaks at 7.5; y=5 is hit at t≈0.211 and t≈0.789,
      // which gives x≈1.15 and x≈8.85.
      expect(pts.length).toBeGreaterThanOrEqual(2);
    });
    it("line nowhere near the cubic returns empty", () => {
      const pts = intersect.segmentCubic(
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
      );
      expect(pts).toHaveLength(0);
    });
  });
});
