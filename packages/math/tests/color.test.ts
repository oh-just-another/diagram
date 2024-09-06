import { describe, expect, it } from "vitest";
import * as color from "../src/color";

describe("color", () => {
  describe("parse", () => {
    it("parses #rgb shorthand", () => {
      expect(color.parse("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(color.parse("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    });
    it("parses #rgba shorthand", () => {
      expect(color.parse("#f008")).toEqual({ r: 255, g: 0, b: 0, a: 136 / 255 });
    });
    it("parses #rrggbb", () => {
      expect(color.parse("#ff8000")).toEqual({ r: 255, g: 128, b: 0, a: 1 });
    });
    it("parses #rrggbbaa", () => {
      const c = color.parse("#ff80007f");
      expect(c.r).toBe(255);
      expect(c.g).toBe(128);
      expect(c.b).toBe(0);
      expect(c.a).toBeCloseTo(127 / 255, 4);
    });
    it("parses rgb() and rgba()", () => {
      expect(color.parse("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
      expect(color.parse("rgba(10, 20, 30, 0.5)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    });
    it("parses named colors", () => {
      expect(color.parse("black")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
      expect(color.parse("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
      expect(color.parse("WHITE")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    });
    it("trims whitespace", () => {
      expect(color.parse("  #f00 ")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });
    it("throws on garbage input", () => {
      expect(() => color.parse("not-a-color")).toThrow();
      expect(() => color.parse("#xyz")).toThrow();
      expect(() => color.parse("#ff")).toThrow();
    });
  });

  describe("format", () => {
    it("uses #rrggbb when alpha is 1", () => {
      expect(color.format({ r: 255, g: 0, b: 0, a: 1 })).toBe("#ff0000");
      expect(color.format({ r: 0, g: 128, b: 255, a: 1 })).toBe("#0080ff");
    });
    it("uses rgba() when alpha is not 1", () => {
      expect(color.format({ r: 255, g: 0, b: 0, a: 0.5 })).toBe("rgba(255, 0, 0, 0.5)");
    });
    it("clamps channels into valid range", () => {
      expect(color.format({ r: 300, g: -10, b: 128, a: 2 })).toBe("#ff0080");
      expect(color.format({ r: 0, g: 0, b: 0, a: -1 })).toBe("rgba(0, 0, 0, 0)");
    });
    it("round-trips parse → format for hex", () => {
      const original = "#abcdef";
      expect(color.format(color.parse(original))).toBe(original);
    });
  });

  describe("mix", () => {
    const red = { r: 255, g: 0, b: 0, a: 1 };
    const blue = { r: 0, g: 0, b: 255, a: 1 };
    it("at t=0 returns the first color", () => {
      expect(color.mix(red, blue, 0)).toEqual(red);
    });
    it("at t=1 returns the second color", () => {
      expect(color.mix(red, blue, 1)).toEqual(blue);
    });
    it("at t=0.5 returns midpoint", () => {
      expect(color.mix(red, blue, 0.5)).toEqual({ r: 127.5, g: 0, b: 127.5, a: 1 });
    });
  });

  describe("withAlpha", () => {
    it("returns a new color with adjusted alpha", () => {
      const c = { r: 10, g: 20, b: 30, a: 1 };
      expect(color.withAlpha(c, 0.5)).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    });
  });

  describe("contrast", () => {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const grey = { r: 128, g: 128, b: 128, a: 1 };

    it("luminance bounds", () => {
      expect(color.luminance(black)).toBeCloseTo(0, 5);
      expect(color.luminance(white)).toBeCloseTo(1, 5);
    });

    it("contrast ratio black/white = 21", () => {
      expect(color.contrastRatio(black, white)).toBeCloseTo(21, 1);
      // Symmetric.
      expect(color.contrastRatio(white, black)).toBeCloseTo(21, 1);
    });

    it("contrast ratio same colour = 1", () => {
      expect(color.contrastRatio(grey, grey)).toBeCloseTo(1, 5);
    });

    it("WCAG AA — passes for black/white", () => {
      expect(color.meetsContrastAA(black, white)).toBe(true);
      expect(color.meetsContrastAA(black, white, true)).toBe(true);
    });

    it("WCAG AA — fails for medium grey on white (text)", () => {
      // (#777 ≈ rgb 119,119,119) gives ~4.48:1 — just below 4.5 normal,
      // above 3 large.
      const greyish = { r: 119, g: 119, b: 119, a: 1 };
      expect(color.meetsContrastAA(greyish, white)).toBe(false);
      expect(color.meetsContrastAA(greyish, white, true)).toBe(true);
    });

    it("WCAG AAA stricter than AA", () => {
      // #595959 = rgb 89,89,89 — ratio ~7.46 borderline; #666666 ≈ 5.74:1
      // passes AA, fails AAA.
      const dark = { r: 102, g: 102, b: 102, a: 1 };
      expect(color.meetsContrastAA(dark, white)).toBe(true);
      expect(color.meetsContrastAAA(dark, white)).toBe(false);
    });
  });
});
