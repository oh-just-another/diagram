import { describe, expect, it } from "vitest";
import { getCornerRadius } from "../src/style";
import { ADAPTIVE_CORNER_RADIUS, PROPORTIONAL_CORNER_RADIUS } from "../src/constants";

describe("getCornerRadius", () => {
  it("returns 0 for sharp / missing roundness", () => {
    expect(getCornerRadius(undefined, 100, 100)).toBe(0);
    expect(getCornerRadius({ type: "sharp" }, 100, 100)).toBe(0);
  });

  it("returns 0 when a dimension collapses to zero", () => {
    expect(getCornerRadius({ type: "round" }, 0, 100)).toBe(0);
    expect(getCornerRadius({ type: "round" }, 100, 0)).toBe(0);
  });

  it("adaptive default: proportional for shapes below the cutoff", () => {
    // cutoff = ADAPTIVE / PROPORTIONAL = 32 / 0.25 = 128 px.
    // 80 < 128 → proportional 25 % = 20.
    expect(getCornerRadius({ type: "round" }, 80, 200)).toBe(80 * PROPORTIONAL_CORNER_RADIUS);
  });

  it("adaptive default: fixed for shapes above the cutoff", () => {
    expect(getCornerRadius({ type: "round" }, 500, 200)).toBe(ADAPTIVE_CORNER_RADIUS);
    expect(getCornerRadius({ type: "round" }, 200, 200)).toBe(ADAPTIVE_CORNER_RADIUS);
  });

  it("honours an explicit value override", () => {
    expect(getCornerRadius({ type: "round", value: 8 }, 500, 500)).toBe(8);
  });

  it("clamps explicit value to half the smaller side (no self-overlap)", () => {
    // smaller side = 40 → max radius = 20.
    expect(getCornerRadius({ type: "round", value: 100 }, 40, 200)).toBe(20);
  });

  it("rejects negative explicit value", () => {
    expect(getCornerRadius({ type: "round", value: -5 }, 100, 100)).toBe(0);
  });

  it("treats width/height as |abs| (rotated/mirrored shapes)", () => {
    expect(getCornerRadius({ type: "round" }, -80, 200)).toBe(80 * PROPORTIONAL_CORNER_RADIUS);
  });
});
