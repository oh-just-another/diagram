import { describe, expect, it } from "vitest";
import * as matrix from "../src/matrix.js";

const close = (a: number, b: number, eps = 1e-10): boolean => Math.abs(a - b) < eps;

describe("matrix", () => {
  describe("IDENTITY / of", () => {
    it("IDENTITY is the affine identity matrix", () => {
      expect(matrix.IDENTITY).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    });
    it("of constructs from six components", () => {
      expect(matrix.of(1, 2, 3, 4, 5, 6)).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 });
    });
  });

  describe("primitives", () => {
    it("translation", () => {
      expect(matrix.translation(10, 20)).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 });
    });
    it("scaling uniform", () => {
      expect(matrix.scaling(2)).toEqual({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
    });
    it("scaling per-axis", () => {
      expect(matrix.scaling(2, 3)).toEqual({ a: 2, b: 0, c: 0, d: 3, e: 0, f: 0 });
    });
    it("rotation by 0 is identity", () => {
      const r = matrix.rotation(0);
      expect(matrix.equals(r, matrix.IDENTITY, 1e-10)).toBe(true);
    });
    it("rotation by π is a 180° flip", () => {
      const r = matrix.rotation(Math.PI);
      expect(close(r.a, -1)).toBe(true);
      expect(close(r.d, -1)).toBe(true);
      expect(close(r.b, 0)).toBe(true);
      expect(close(r.c, 0)).toBe(true);
    });
  });

  describe("multiply", () => {
    it("identity is the multiplicative identity", () => {
      const m = matrix.of(2, 3, 4, 5, 6, 7);
      expect(matrix.equals(matrix.multiply(matrix.IDENTITY, m), m)).toBe(true);
      expect(matrix.equals(matrix.multiply(m, matrix.IDENTITY), m)).toBe(true);
    });
    it("translation × translation composes additively", () => {
      const t1 = matrix.translation(1, 2);
      const t2 = matrix.translation(3, 4);
      const r = matrix.multiply(t1, t2);
      expect(r.e).toBe(4);
      expect(r.f).toBe(6);
    });
    it("multiply is associative", () => {
      const a = matrix.scaling(2);
      const b = matrix.rotation(Math.PI / 4);
      const c = matrix.translation(5, 7);
      const left = matrix.multiply(matrix.multiply(a, b), c);
      const right = matrix.multiply(a, matrix.multiply(b, c));
      expect(matrix.equals(left, right, 1e-10)).toBe(true);
    });
  });

  describe("inverse", () => {
    it("inverse of identity is identity", () => {
      expect(matrix.equals(matrix.inverse(matrix.IDENTITY), matrix.IDENTITY)).toBe(true);
    });
    it("matrix × inverse = identity", () => {
      const m = matrix.multiply(matrix.translation(5, 7), matrix.rotation(0.7));
      const inv = matrix.inverse(m);
      expect(matrix.equals(matrix.multiply(m, inv), matrix.IDENTITY, 1e-10)).toBe(true);
    });
    it("throws on singular matrix", () => {
      expect(() => matrix.inverse({ a: 1, b: 2, c: 2, d: 4, e: 0, f: 0 })).toThrow(/singular/i);
    });
  });

  describe("applyToPoint", () => {
    it("identity leaves points untouched", () => {
      expect(matrix.applyToPoint(matrix.IDENTITY, { x: 5, y: 7 })).toEqual({ x: 5, y: 7 });
    });
    it("translation adds to coordinates", () => {
      expect(matrix.applyToPoint(matrix.translation(3, 4), { x: 1, y: 1 })).toEqual({
        x: 4,
        y: 5,
      });
    });
    it("rotation by π/2 turns (1, 0) into (0, 1)", () => {
      const p = matrix.applyToPoint(matrix.rotation(Math.PI / 2), { x: 1, y: 0 });
      expect(close(p.x, 0)).toBe(true);
      expect(close(p.y, 1)).toBe(true);
    });
    it("composition order matches multiply(a, b).apply(p) = a.apply(b.apply(p))", () => {
      const a = matrix.translation(10, 0);
      const b = matrix.scaling(2);
      const p = { x: 3, y: 4 };
      const composed = matrix.applyToPoint(matrix.multiply(a, b), p);
      const sequential = matrix.applyToPoint(a, matrix.applyToPoint(b, p));
      expect(close(composed.x, sequential.x)).toBe(true);
      expect(close(composed.y, sequential.y)).toBe(true);
    });
  });

  describe("applyToBounds", () => {
    it("identity preserves bounds", () => {
      const b = { x: 1, y: 2, width: 10, height: 20 };
      expect(matrix.applyToBounds(matrix.IDENTITY, b)).toEqual(b);
    });
    it("translation shifts bounds", () => {
      const b = matrix.applyToBounds(matrix.translation(5, 7), {
        x: 1,
        y: 1,
        width: 10,
        height: 10,
      });
      expect(b).toEqual({ x: 6, y: 8, width: 10, height: 10 });
    });
    it("rotation produces AABB of rotated corners", () => {
      const b = matrix.applyToBounds(matrix.rotation(Math.PI / 4), {
        x: -1,
        y: -1,
        width: 2,
        height: 2,
      });
      // 2x2 square centered at origin rotated 45° fits in a √2-wide square
      expect(close(b.width, 2 * Math.sqrt(2), 1e-10)).toBe(true);
      expect(close(b.height, 2 * Math.sqrt(2), 1e-10)).toBe(true);
    });
  });

  describe("decompose", () => {
    it("recovers translation", () => {
      const d = matrix.decompose(matrix.translation(3, 4));
      expect(d.translation).toEqual({ x: 3, y: 4 });
      expect(close(d.rotation, 0)).toBe(true);
      expect(close(d.scale.x, 1)).toBe(true);
      expect(close(d.scale.y, 1)).toBe(true);
    });
    it("recovers scale", () => {
      const d = matrix.decompose(matrix.scaling(2, 3));
      expect(close(d.scale.x, 2)).toBe(true);
      expect(close(d.scale.y, 3)).toBe(true);
    });
    it("recovers rotation", () => {
      const d = matrix.decompose(matrix.rotation(Math.PI / 3));
      expect(close(d.rotation, Math.PI / 3)).toBe(true);
    });
    it("recovers TRS composition", () => {
      const m = matrix.multiply(
        matrix.translation(10, 20),
        matrix.multiply(matrix.rotation(Math.PI / 6), matrix.scaling(2)),
      );
      const d = matrix.decompose(m);
      expect(close(d.translation.x, 10)).toBe(true);
      expect(close(d.translation.y, 20)).toBe(true);
      expect(close(d.rotation, Math.PI / 6)).toBe(true);
      expect(close(d.scale.x, 2)).toBe(true);
      expect(close(d.scale.y, 2)).toBe(true);
    });
  });

  describe("equals", () => {
    it("strict and epsilon equality", () => {
      expect(matrix.equals(matrix.IDENTITY, matrix.IDENTITY)).toBe(true);
      expect(matrix.equals({ ...matrix.IDENTITY, a: 1.001 }, matrix.IDENTITY)).toBe(false);
      expect(matrix.equals({ ...matrix.IDENTITY, a: 1.001 }, matrix.IDENTITY, 0.01)).toBe(true);
    });
  });
});
