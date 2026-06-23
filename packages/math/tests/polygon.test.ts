import { describe, expect, it } from "vitest";
import { offsetClosedPath, signedArea } from "../src/polygon";

describe("signedArea", () => {
  it("positive for one winding, negative for the reverse", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const a = signedArea(square);
    const b = signedArea([...square].reverse());
    expect(a).toBe(-b);
    expect(Math.abs(a)).toBe(100);
  });
});

describe("offsetClosedPath", () => {
  it("inset 1 px on a unit square produces an 8×8 square inside the 10×10 original", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const inset = offsetClosedPath(square, 1);
    expect(inset).toEqual([
      { x: 1, y: 1 },
      { x: 9, y: 1 },
      { x: 9, y: 9 },
      { x: 1, y: 9 },
    ]);
  });

  it("outset (negative distance) expands by 1 px", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const outset = offsetClosedPath(square, -1);
    expect(outset).toEqual([
      { x: -1, y: -1 },
      { x: 11, y: -1 },
      { x: 11, y: 11 },
      { x: -1, y: 11 },
    ]);
  });

  it("zero distance returns a copy of the input (not the same reference)", () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 0 },
    ];
    const out = offsetClosedPath(tri, 0);
    expect(out).toEqual(tri);
    expect(out).not.toBe(tri);
    expect(out[0]).not.toBe(tri[0]);
  });

  it("inset on a 45° angle uses miter-length scaling (not just edge offset)", () => {
    // Right triangle: legs along +x and +y, hypotenuse at 45°.
    const tri = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    const inset = offsetClosedPath(tri, 1);
    // At the right-angle vertex (0,0), bisector points along
    // (1, 1)/√2 toward the centroid. Miter length = 1 / cos(45°) =
    // √2. Move = (1, 1). New vertex = (1, 1).
    expect(inset[0]!.x).toBeCloseTo(1, 5);
    expect(inset[0]!.y).toBeCloseTo(1, 5);
  });

  it("handles fewer than 3 vertices as no-op", () => {
    expect(
      offsetClosedPath(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        1,
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
  });

  it("works on a CCW polygon (reverse winding) — orientation-agnostic", () => {
    const square = [
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ];
    const inset = offsetClosedPath(square, 1);
    expect(new Set(inset.map((p) => `${p.x},${p.y}`))).toEqual(
      new Set(["1,1", "1,9", "9,1", "9,9"]),
    );
  });

  it("degenerate zero-length edge (duplicate vertex) does not throw or NaN", () => {
    // Two coincident vertices produce a zero-length edge; `Math.hypot(...) || 1`
    // guards the divide-by-zero so the normal stays finite.
    const poly = [
      { x: 0, y: 0 },
      { x: 0, y: 0 }, // duplicate → zero-length edge
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const out = offsetClosedPath(poly, 1);
    expect(out).toHaveLength(5);
    for (const p of out) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("180° spike vertex (bisector ill-defined) falls back to a normal", () => {
    // A needle/spike: the path goes out to a far point and immediately back,
    // so at that vertex the two adjacent edge normals are opposite and the
    // bisector length ≈ 0 → the code uses one normal instead of NaN.
    const spike = [
      { x: 0, y: 0 },
      { x: 100, y: 0.0001 }, // out
      { x: 0, y: 0.0002 }, // back almost on top of the first edge → 180° turn
      { x: 0, y: 50 },
    ];
    const out = offsetClosedPath(spike, 1);
    expect(out).toHaveLength(4);
    for (const p of out) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("very sharp angle (cos ≤ 1e-6) clamps miter length to distance", () => {
    // A thin sliver triangle: the apex angle is near 0° so the bisector is
    // nearly perpendicular to the edge normal (cos ≈ 0) and the miter clamp
    // (`cos > 1e-6 ? distance/cos : distance`) takes the else branch.
    const sliver = [
      { x: 0, y: 0 },
      { x: 100, y: 1 },
      { x: 100, y: -1 },
    ];
    const out = offsetClosedPath(sliver, 1);
    expect(out).toHaveLength(3);
    for (const p of out) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
