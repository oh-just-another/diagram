import { describe, expect, it } from "vitest";
import type { Vec2 } from "@oh-just-another/types";
import { brushOutline } from "../src/brush-outline.js";
import type { BrushPoint } from "../src/shape.js";

const bp = (x: number, y: number, width = 5): BrushPoint => ({ x, y, width });

/** Do open segments `p1→p2` and `p3→p4` cross at an interior point? */
const segsCross = (p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean => {
  const d = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0; // strict → ignore shared endpoints
};

/** True when the closed polygon has no two non-adjacent edges that cross. */
const isSimplePolygon = (poly: readonly Vec2[]): boolean => {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a1 = poly[i]!;
    const a2 = poly[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      if (j === i) continue;
      // Skip adjacent edges (share a vertex).
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const b1 = poly[j]!;
      const b2 = poly[(j + 1) % n]!;
      if (segsCross(a1, a2, b1, b2)) return false;
    }
  }
  return true;
};

const allFinite = (poly: readonly Vec2[]): boolean =>
  poly.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

describe("brushOutline", () => {
  it("returns [] for fewer than two points", () => {
    expect(brushOutline([])).toEqual([]);
    expect(brushOutline([bp(0, 0)])).toEqual([]);
  });

  it("wraps a straight stroke in a rounded stadium (simple, closed, finite)", () => {
    const out = brushOutline([bp(0, 0, 5), bp(100, 0, 5)]);
    expect(out.length).toBeGreaterThan(4);
    expect(allFinite(out)).toBe(true);
    expect(isSimplePolygon(out)).toBe(true);
    // Body spans the width both sides of the centreline; caps bulge past the ends.
    const ys = out.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(-5, 5);
    expect(Math.max(...ys)).toBeCloseTo(5, 5);
    const xs = out.map((p) => p.x);
    // Round caps bulge ~a half-width past each end (polygonal arc → just inside w).
    expect(Math.min(...xs)).toBeLessThan(-4.5);
    expect(Math.max(...xs)).toBeGreaterThan(104.5);
  });

  it("stays a SIMPLE polygon around a sharp corner (earcut-safe)", () => {
    // A right-angle bend — the concave side must miter/bevel, not self-cross.
    const out = brushOutline([bp(0, 0, 8), bp(50, 0, 8), bp(50, 50, 8)]);
    expect(allFinite(out)).toBe(true);
    expect(isSimplePolygon(out)).toBe(true);
  });

  it("does not spike on a hairpin turn (miter clamp → bevel)", () => {
    // Near-180° reversal: an unclamped miter would shoot to infinity. The ribbon
    // genuinely overlaps itself here (so the polygon is NOT simple — inherent, and
    // fine on nonzero-winding fills), but the miter clamp keeps every point bounded.
    const out = brushOutline([bp(0, 0, 6), bp(100, 0, 6), bp(2, 0.5, 6)]);
    expect(allFinite(out)).toBe(true);
    expect(out.every((p) => Math.abs(p.x) < 200 && Math.abs(p.y) < 200)).toBe(true);
  });

  it("honours per-vertex width (a tapering stroke widens the outline span)", () => {
    const thin = brushOutline([bp(0, 0, 1), bp(100, 0, 1)]);
    const fat = brushOutline([bp(0, 0, 20), bp(100, 0, 20)]);
    const spanY = (poly: readonly Vec2[]) =>
      Math.max(...poly.map((p) => p.y)) - Math.min(...poly.map((p) => p.y));
    expect(spanY(fat)).toBeGreaterThan(spanY(thin));
    expect(spanY(thin)).toBeCloseTo(2, 5);
    expect(spanY(fat)).toBeCloseTo(40, 5);
  });
});
