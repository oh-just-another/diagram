import { describe, expect, it } from "vitest";
import * as bounds from "../src/bounds";

describe("bounds", () => {
  describe("EMPTY / of", () => {
    it("EMPTY is zero-sized", () => {
      expect(bounds.EMPTY).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });
    it("of constructs from xywh", () => {
      expect(bounds.of(1, 2, 3, 4)).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    });
  });

  describe("fromPoints", () => {
    it("returns EMPTY for empty array", () => {
      expect(bounds.fromPoints([])).toEqual(bounds.EMPTY);
    });
    it("wraps a single point with zero size", () => {
      expect(bounds.fromPoints([{ x: 5, y: 7 }])).toEqual({ x: 5, y: 7, width: 0, height: 0 });
    });
    it("computes AABB of multiple points", () => {
      const b = bounds.fromPoints([
        { x: 1, y: 10 },
        { x: 5, y: 0 },
        { x: -2, y: 7 },
      ]);
      expect(b).toEqual({ x: -2, y: 0, width: 7, height: 10 });
    });
  });

  describe("fromCenter / centerOf", () => {
    it("fromCenter centers the bounds at the given point", () => {
      expect(bounds.fromCenter({ x: 0, y: 0 }, 10, 20)).toEqual({
        x: -5,
        y: -10,
        width: 10,
        height: 20,
      });
    });
    it("centerOf is the geometric center", () => {
      expect(bounds.centerOf({ x: 0, y: 0, width: 10, height: 20 })).toEqual({ x: 5, y: 10 });
    });
  });

  describe("maxX / maxY", () => {
    it("returns far corner coordinates", () => {
      expect(bounds.maxX({ x: 1, y: 2, width: 3, height: 4 })).toBe(4);
      expect(bounds.maxY({ x: 1, y: 2, width: 3, height: 4 })).toBe(6);
    });
  });

  describe("isEmpty", () => {
    it("treats zero or negative size as empty", () => {
      expect(bounds.isEmpty(bounds.EMPTY)).toBe(true);
      expect(bounds.isEmpty({ x: 0, y: 0, width: 10, height: 0 })).toBe(true);
      expect(bounds.isEmpty({ x: 0, y: 0, width: -1, height: 5 })).toBe(true);
      expect(bounds.isEmpty({ x: 0, y: 0, width: 1, height: 1 })).toBe(false);
    });
  });

  describe("union", () => {
    it("union with EMPTY returns the other operand", () => {
      const b = { x: 1, y: 2, width: 3, height: 4 };
      expect(bounds.union(bounds.EMPTY, b)).toEqual(b);
      expect(bounds.union(b, bounds.EMPTY)).toEqual(b);
    });
    it("union of disjoint covers both", () => {
      const u = bounds.union(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 20, width: 5, height: 5 },
      );
      expect(u).toEqual({ x: 0, y: 0, width: 25, height: 25 });
    });
    it("union of overlapping", () => {
      const u = bounds.union(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 5, y: 5, width: 10, height: 10 },
      );
      expect(u).toEqual({ x: 0, y: 0, width: 15, height: 15 });
    });
  });

  describe("intersection / intersects", () => {
    it("returns null when disjoint", () => {
      const i = bounds.intersection(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 20, width: 5, height: 5 },
      );
      expect(i).toBeNull();
      expect(
        bounds.intersects(
          { x: 0, y: 0, width: 10, height: 10 },
          { x: 20, y: 20, width: 5, height: 5 },
        ),
      ).toBe(false);
    });
    it("returns null when only touching at an edge", () => {
      const i = bounds.intersection(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 10, y: 0, width: 10, height: 10 },
      );
      expect(i).toBeNull();
    });
    it("returns overlapping rectangle", () => {
      const i = bounds.intersection(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 5, y: 5, width: 10, height: 10 },
      );
      expect(i).toEqual({ x: 5, y: 5, width: 5, height: 5 });
    });
  });

  describe("contains / containsBounds", () => {
    const b = { x: 0, y: 0, width: 10, height: 10 };
    it("contains points on boundary and interior", () => {
      expect(bounds.contains(b, { x: 0, y: 0 })).toBe(true);
      expect(bounds.contains(b, { x: 5, y: 5 })).toBe(true);
      expect(bounds.contains(b, { x: 10, y: 10 })).toBe(true);
    });
    it("rejects points outside", () => {
      expect(bounds.contains(b, { x: -1, y: 5 })).toBe(false);
      expect(bounds.contains(b, { x: 11, y: 5 })).toBe(false);
    });
    it("containsBounds for fully nested rectangle", () => {
      expect(bounds.containsBounds(b, { x: 2, y: 2, width: 5, height: 5 })).toBe(true);
    });
    it("containsBounds rejects when inner pokes out", () => {
      expect(bounds.containsBounds(b, { x: 8, y: 0, width: 5, height: 5 })).toBe(false);
    });
  });

  describe("expand / normalize / equals", () => {
    it("expand grows on all sides", () => {
      expect(bounds.expand({ x: 0, y: 0, width: 10, height: 10 }, 2)).toEqual({
        x: -2,
        y: -2,
        width: 14,
        height: 14,
      });
    });
    it("normalize flips negative width/height", () => {
      expect(bounds.normalize({ x: 10, y: 10, width: -4, height: -6 })).toEqual({
        x: 6,
        y: 4,
        width: 4,
        height: 6,
      });
    });
    it("equals supports epsilon", () => {
      const a = { x: 0, y: 0, width: 10, height: 10 };
      const b = { x: 0.0001, y: 0, width: 10, height: 10 };
      expect(bounds.equals(a, b)).toBe(false);
      expect(bounds.equals(a, b, 0.001)).toBe(true);
    });
  });
});
