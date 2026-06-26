import { describe, expect, it } from "vitest";
import * as scalar from "../src/scalar";

describe("scalar", () => {
  describe("clamp", () => {
    it("returns v unchanged when within range", () => {
      expect(scalar.clamp(5, 0, 10)).toBe(5);
    });

    it("clamps up to min when below range", () => {
      expect(scalar.clamp(-3, 0, 10)).toBe(0);
    });

    it("clamps down to max when above range", () => {
      expect(scalar.clamp(42, 0, 10)).toBe(10);
    });

    it("returns the boundary when v equals min", () => {
      expect(scalar.clamp(0, 0, 10)).toBe(0);
    });

    it("returns the boundary when v equals max", () => {
      expect(scalar.clamp(10, 0, 10)).toBe(10);
    });

    it("collapses to the single value when min equals max", () => {
      expect(scalar.clamp(5, 3, 3)).toBe(3);
      expect(scalar.clamp(-5, 3, 3)).toBe(3);
    });

    it("works with negative ranges", () => {
      expect(scalar.clamp(-7, -10, -2)).toBe(-7);
      expect(scalar.clamp(-15, -10, -2)).toBe(-10);
      expect(scalar.clamp(0, -10, -2)).toBe(-2);
    });
  });

  describe("clamp01", () => {
    it("clamps values below 0 to 0", () => {
      expect(scalar.clamp01(-0.5)).toBe(0);
      expect(scalar.clamp01(-100)).toBe(0);
    });

    it("returns 0 at the lower boundary", () => {
      expect(scalar.clamp01(0)).toBe(0);
    });

    it("returns mid-range values unchanged", () => {
      expect(scalar.clamp01(0.5)).toBe(0.5);
    });

    it("returns 1 at the upper boundary", () => {
      expect(scalar.clamp01(1)).toBe(1);
    });

    it("clamps values above 1 to 1", () => {
      expect(scalar.clamp01(1.5)).toBe(1);
      expect(scalar.clamp01(100)).toBe(1);
    });
  });
});
