import { describe, expect, it } from "vitest";
import { avoidSelfOverlap } from "../src/elbow-link.js";

// Are any two consecutive segments antiparallel along the same axis (a 180°
// fold that retraces the previous segment)?
const hasFold = (pts: { x: number; y: number }[]): boolean => {
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const abH = Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6;
    const bcH = Math.abs(b.y - c.y) < 1e-6 && Math.abs(b.x - c.x) > 1e-6;
    const abV = Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6;
    const bcV = Math.abs(b.x - c.x) < 1e-6 && Math.abs(b.y - c.y) > 1e-6;
    if (abH && bcH && Math.sign(b.x - a.x) === -Math.sign(c.x - b.x)) return true;
    if (abV && bcV && Math.sign(b.y - a.y) === -Math.sign(c.y - b.y)) return true;
  }
  return false;
};

describe("avoidSelfOverlap", () => {
  it("offsets a vertical 180° fold into a U (no retrace, gap apart)", () => {
    // Up then straight back down on the same x → fold at (0,-30).
    const folded = [
      { x: 0, y: 0 },
      { x: 0, y: -30 },
      { x: 0, y: 200 },
      { x: 100, y: 200 },
    ];
    expect(hasFold(folded)).toBe(true);
    const fixed = avoidSelfOverlap(folded, 16);
    expect(hasFold(fixed)).toBe(false);
    // The return arm runs offset on x by the gap (not on x=0).
    expect(fixed.some((p) => Math.abs(Math.abs(p.x) - 16) < 1e-6)).toBe(true);
  });

  it("offsets a horizontal 180° fold", () => {
    const folded = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: -200, y: 0 },
      { x: -200, y: 100 },
    ];
    expect(hasFold(folded)).toBe(true);
    expect(hasFold(avoidSelfOverlap(folded, 16))).toBe(false);
  });

  it("leaves a clean orthogonal path (up, right, down) untouched", () => {
    const clean = [
      { x: 0, y: 0 },
      { x: 0, y: -30 },
      { x: 100, y: -30 },
      { x: 100, y: 200 },
      { x: 100, y: 230 },
    ];
    expect(avoidSelfOverlap(clean, 16)).toEqual(clean);
  });
});
