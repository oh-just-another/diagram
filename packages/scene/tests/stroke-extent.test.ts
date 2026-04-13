import { describe, expect, it } from "vitest";
import { strokeOutsideExtent, type Style } from "../src/index";

describe("strokeOutsideExtent", () => {
  const withStroke = (over: Partial<Style>): Style => ({ stroke: "#000", strokeWidth: 4, ...over });

  it("is 0 with no stroke (fill-only) — visible edge is the contour", () => {
    expect(strokeOutsideExtent({ fill: "#abc" })).toBe(0);
    expect(strokeOutsideExtent({ stroke: "transparent", strokeWidth: 4 })).toBe(0);
    expect(strokeOutsideExtent(withStroke({ strokeWidth: 0 }))).toBe(0);
  });

  it("center alignment (default) extends half the width outside", () => {
    expect(strokeOutsideExtent(withStroke({}))).toBe(2);
    expect(strokeOutsideExtent(withStroke({ strokeAlign: "center" }))).toBe(2);
  });

  it("outside alignment extends the full width; inside extends none", () => {
    expect(strokeOutsideExtent(withStroke({ strokeAlign: "outside" }))).toBe(4);
    expect(strokeOutsideExtent(withStroke({ strokeAlign: "inside" }))).toBe(0);
  });

  it("defaults the width to 1 when a stroke colour is set without a width", () => {
    expect(strokeOutsideExtent({ stroke: "#000" })).toBe(0.5);
  });
});
