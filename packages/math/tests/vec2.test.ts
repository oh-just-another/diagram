import { describe, expect, it } from "vitest";
import * as vec2 from "../src/vec2";

const close = (a: number, b: number, eps = 1e-10): boolean => Math.abs(a - b) < eps;

describe("vec2", () => {
  describe("of / ZERO", () => {
    it("ZERO is (0, 0)", () => {
      expect(vec2.ZERO).toEqual({ x: 0, y: 0 });
    });
    it("of constructs a vector", () => {
      expect(vec2.of(3, 4)).toEqual({ x: 3, y: 4 });
    });
  });

  describe("add / sub / mul / div / negate", () => {
    it("add", () => {
      expect(vec2.add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    });
    it("sub", () => {
      expect(vec2.sub({ x: 5, y: 7 }, { x: 1, y: 3 })).toEqual({ x: 4, y: 4 });
    });
    it("mul scales by scalar", () => {
      expect(vec2.mul({ x: 2, y: 3 }, 2)).toEqual({ x: 4, y: 6 });
      expect(vec2.mul({ x: 2, y: 3 }, -1)).toEqual({ x: -2, y: -3 });
    });
    it("div", () => {
      expect(vec2.div({ x: 4, y: 6 }, 2)).toEqual({ x: 2, y: 3 });
    });
    it("negate", () => {
      expect(vec2.negate({ x: 1, y: -2 })).toEqual({ x: -1, y: 2 });
    });
  });

  describe("dot / cross", () => {
    it("dot of perpendicular vectors is 0", () => {
      expect(vec2.dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0);
    });
    it("dot of parallel vectors is product of lengths", () => {
      expect(vec2.dot({ x: 2, y: 0 }, { x: 3, y: 0 })).toBe(6);
    });
    it("cross of parallel vectors is 0", () => {
      expect(vec2.cross({ x: 2, y: 0 }, { x: 4, y: 0 })).toBe(0);
    });
    it("cross is signed area of parallelogram", () => {
      expect(vec2.cross({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(1);
      expect(vec2.cross({ x: 0, y: 1 }, { x: 1, y: 0 })).toBe(-1);
    });
  });

  describe("length / distance", () => {
    it("length of (3, 4) is 5", () => {
      expect(vec2.length({ x: 3, y: 4 })).toBe(5);
    });
    it("lengthSq avoids sqrt", () => {
      expect(vec2.lengthSq({ x: 3, y: 4 })).toBe(25);
    });
    it("distance between points", () => {
      expect(vec2.distance({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(5);
    });
    it("distanceSq", () => {
      expect(vec2.distanceSq({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
    });
  });

  describe("normalize", () => {
    it("returns unit vector preserving direction", () => {
      const n = vec2.normalize({ x: 3, y: 4 });
      expect(close(vec2.length(n), 1)).toBe(true);
      expect(close(n.x, 0.6)).toBe(true);
      expect(close(n.y, 0.8)).toBe(true);
    });
    it("returns ZERO for zero vector instead of NaN", () => {
      expect(vec2.normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    });
  });

  describe("lerp", () => {
    it("at t=0 returns a, at t=1 returns b", () => {
      expect(vec2.lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0)).toEqual({ x: 0, y: 0 });
      expect(vec2.lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 1)).toEqual({ x: 10, y: 20 });
    });
    it("at t=0.5 returns midpoint", () => {
      expect(vec2.lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 });
    });
  });

  describe("angle / rotate / perp", () => {
    it("angle of (1, 0) is 0", () => {
      expect(vec2.angle({ x: 1, y: 0 })).toBe(0);
    });
    it("angle of (0, 1) is π/2", () => {
      expect(close(vec2.angle({ x: 0, y: 1 }), Math.PI / 2)).toBe(true);
    });
    it("rotate by π/2 turns (1, 0) into (0, 1)", () => {
      const r = vec2.rotate({ x: 1, y: 0 }, Math.PI / 2);
      expect(close(r.x, 0)).toBe(true);
      expect(close(r.y, 1)).toBe(true);
    });
    it("perp turns (1, 0) into (0, 1) (ccw)", () => {
      const r = vec2.perp({ x: 1, y: 0 });
      expect(Math.abs(r.x)).toBe(0); // accept ±0
      expect(r.y).toBe(1);
    });
  });

  describe("equals", () => {
    it("exact equality without epsilon", () => {
      expect(vec2.equals({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
      expect(vec2.equals({ x: 1, y: 2 }, { x: 1.0001, y: 2 })).toBe(false);
    });
    it("epsilon equality", () => {
      expect(vec2.equals({ x: 1, y: 2 }, { x: 1.0001, y: 2 }, 0.01)).toBe(true);
    });
  });
});
