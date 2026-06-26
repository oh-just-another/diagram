import { describe, expect, it } from "vitest";
import * as bezier from "../src/bezier";

const close = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) < eps;

describe("bezier", () => {
  describe("quadraticAt", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 5, y: 10 };
    const p2 = { x: 10, y: 0 };

    it("returns p0 at t=0 and p2 at t=1", () => {
      expect(bezier.quadraticAt(p0, p1, p2, 0)).toEqual(p0);
      expect(bezier.quadraticAt(p0, p1, p2, 1)).toEqual(p2);
    });
    it("at t=0.5 returns midpoint formula", () => {
      const m = bezier.quadraticAt(p0, p1, p2, 0.5);
      expect(close(m.x, 5)).toBe(true);
      expect(close(m.y, 5)).toBe(true);
    });
  });

  describe("cubicAt", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 10 };
    const p2 = { x: 10, y: 10 };
    const p3 = { x: 10, y: 0 };

    it("returns p0 at t=0 and p3 at t=1", () => {
      expect(bezier.cubicAt(p0, p1, p2, p3, 0)).toEqual(p0);
      expect(bezier.cubicAt(p0, p1, p2, p3, 1)).toEqual(p3);
    });
    it("symmetric S-curve has midpoint on x=5", () => {
      const m = bezier.cubicAt(p0, p1, p2, p3, 0.5);
      expect(close(m.x, 5)).toBe(true);
    });
  });

  describe("quadraticBounds", () => {
    it("contains both endpoints and the extremum", () => {
      const b = bezier.quadraticBounds({ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 });
      expect(b.x).toBe(0);
      expect(b.y).toBe(0);
      expect(b.width).toBe(10);
      // extremum y = (0 + 10) / 2 at t=0.5 → max y = 5
      expect(close(b.height, 5)).toBe(true);
    });
    it("monotone curve gives endpoint AABB", () => {
      const b = bezier.quadraticBounds({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 });
      expect(close(b.x, 0)).toBe(true);
      expect(close(b.y, 0)).toBe(true);
      expect(close(b.width, 10)).toBe(true);
      expect(close(b.height, 10)).toBe(true);
    });
  });

  describe("cubicBounds", () => {
    it("symmetric S-curve includes vertical extrema", () => {
      const b = bezier.cubicBounds(
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
      );
      expect(close(b.x, 0)).toBe(true);
      expect(close(b.width, 10)).toBe(true);
      expect(b.height).toBeGreaterThan(0);
      expect(b.height).toBeLessThanOrEqual(10);
    });
    it("straight degenerate cubic gives endpoint AABB", () => {
      const b = bezier.cubicBounds(
        { x: 0, y: 0 },
        { x: 3, y: 3 },
        { x: 7, y: 7 },
        { x: 10, y: 10 },
      );
      expect(close(b.x, 0)).toBe(true);
      expect(close(b.y, 0)).toBe(true);
      expect(close(b.width, 10)).toBe(true);
      expect(close(b.height, 10)).toBe(true);
    });
  });

  describe("hit-test", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 5, y: 10 };
    const p2 = { x: 10, y: 0 };
    it("pointOnQuadratic at apex", () => {
      const apex = bezier.quadraticAt(p0, p1, p2, 0.5);
      expect(bezier.pointOnQuadratic(apex, p0, p1, p2, 0.5)).toBe(true);
    });
    it("pointOnQuadratic far away", () => {
      expect(bezier.pointOnQuadratic({ x: 50, y: 50 }, p0, p1, p2, 1)).toBe(false);
    });
    it("pointOnCubic at sampled point", () => {
      const c0 = { x: 0, y: 0 };
      const c1 = { x: 0, y: 10 };
      const c2 = { x: 10, y: 10 };
      const c3 = { x: 10, y: 0 };
      const sample = bezier.cubicAt(c0, c1, c2, c3, 0.3);
      expect(bezier.pointOnCubic(sample, c0, c1, c2, c3, 0.5)).toBe(true);
    });
  });

  describe("flatten", () => {
    it("flattenQuadratic returns count+1 points", () => {
      const out = bezier.flattenQuadratic({ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }, 8);
      expect(out).toHaveLength(9);
      expect(out[0]).toEqual({ x: 0, y: 0 });
      expect(out[8]).toEqual({ x: 10, y: 0 });
    });
    it("flattenCubic returns count+1 points", () => {
      const out = bezier.flattenCubic(
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
        4,
      );
      expect(out).toHaveLength(5);
    });
  });

  // --- Degenerate extrema branches (exercised through *Bounds) ---
  describe("quadraticExtrema branches (via quadraticBounds)", () => {
    it("collinear control point (denom === 0) yields endpoint-only AABB", () => {
      // a - 2b + c === 0 on both axes: choose b as the midpoint of a,c so the
      // 1D Bezier is linear → no interior extremum → endpoints bound it.
      const b = bezier.quadraticBounds({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 });
      expect(close(b.x, 0)).toBe(true);
      expect(close(b.y, 0)).toBe(true);
      expect(close(b.width, 10)).toBe(true);
      expect(close(b.height, 10)).toBe(true);
    });

    it("extremum outside (0,1) is discarded (t ≤ 0 / t ≥ 1)", () => {
      // Monotone-rising control net: the unconstrained extremum t falls
      // outside (0,1), so the bounds collapse to the endpoints.
      const b = bezier.quadraticBounds({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 10, y: 10 });
      expect(close(b.x, 0)).toBe(true);
      expect(close(b.width, 10)).toBe(true);
      expect(close(b.height, 10)).toBe(true);
    });
  });

  describe("cubicExtrema branches (via cubicBounds)", () => {
    it("straight-line cubic (alpha & beta ≈ 0) has endpoint-only AABB", () => {
      // Evenly-spaced control net → derivative is constant → no extrema.
      const b = bezier.cubicBounds({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 });
      expect(close(b.x, 0)).toBe(true);
      expect(close(b.width, 3)).toBe(true);
      expect(close(b.height, 3)).toBe(true);
    });

    it("degenerate-quadratic derivative (alpha ≈ 0, beta ≠ 0) picks the linear root", () => {
      // alpha = -a + 3b - 3c + d. Pick a net where alpha cancels but beta does
      // not, so the derivative is linear with one root, possibly in (0,1).
      // x: a=0,b=1,c=2,d=3 → alpha=0 (line). y: choose a curve with a bump.
      const b = bezier.cubicBounds({ x: 0, y: 0 }, { x: 1, y: 3 }, { x: 2, y: -3 }, { x: 3, y: 0 });
      // y dips below 0 and rises above 0 — real extrema exist beyond endpoints.
      expect(b.y).toBeLessThan(0);
      expect(b.y + b.height).toBeGreaterThan(0);
    });

    it("negative discriminant (disc < 0) yields no interior extrema", () => {
      // y-net (0,1,1,3): derivative 3t²−2t+1 has discriminant −8 < 0, so it
      // never vanishes → y is strictly monotone → bounds are the endpoints.
      // x-net (0,1,2,3) is linear (alpha = beta = 0) → also endpoint-bound.
      const b = bezier.cubicBounds({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 3 });
      expect(b.x).toBeCloseTo(0, 5);
      expect(b.width).toBeCloseTo(3, 5);
      expect(b.y).toBeCloseTo(0, 5);
      expect(b.height).toBeCloseTo(3, 5);
    });
  });
});
