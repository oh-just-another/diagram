import { describe, expect, it } from "vitest";
import * as color from "../src/color.js";

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
});
