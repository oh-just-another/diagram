import { describe, expect, it } from "vitest";
import {
  cubicToTriangles,
  packCurveTriangles,
  quadraticToTriangle,
  subdivideCubic,
} from "../src/curve-mesh";

/**
 * Sample a Bezier (quadratic or cubic) and check the distance from
 * each sample to the nearest point on the triangle's edges. Used
 * to validate that subdivided cubics actually approximate the
 * source cubic within a sensible tolerance.
 */
const cubicAt = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
) => {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const a = mt2 * mt;
  const b = 3 * mt2 * t;
  const c = 3 * mt * t2;
  const d = t2 * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
};

const quadAt = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number,
) => {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
};

describe("quadraticToTriangle", () => {
  it("packs the three control points as triangle vertices", () => {
    const tri = quadraticToTriangle({ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 30, y: 0 });
    expect(tri).not.toBeNull();
    expect(Array.from(tri!.positions)).toEqual([0, 0, 10, 20, 30, 0]);
  });

  it("Loop-Blinn UV layout: (0,0) (0.5,0) (1,1) for the three vertices", () => {
    const tri = quadraticToTriangle({ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 })!;
    // u,v of each vertex (w = sign, asserted separately):
    expect([tri.uvs[0], tri.uvs[1]]).toEqual([0, 0]);
    expect([tri.uvs[3], tri.uvs[4]]).toEqual([0.5, 0]);
    expect([tri.uvs[6], tri.uvs[7]]).toEqual([1, 1]);
  });

  it("sign flips when the control point mirrors across the chord", () => {
    // The actual sign depends on whether the caller uses y-up or
    // y-down coordinates; what's invariant is that mirroring the
    // control across the p0p2 chord flips it.
    const a = quadraticToTriangle({ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 })!;
    const b = quadraticToTriangle({ x: 0, y: 0 }, { x: 5, y: -10 }, { x: 10, y: 0 })!;
    expect(Math.abs(a.uvs[2]!)).toBe(1);
    expect(Math.abs(b.uvs[2]!)).toBe(1);
    expect(a.uvs[2]).toBe(-b.uvs[2]!);
    // All three vertices share the same sign within a triangle.
    expect(a.uvs[2]).toBe(a.uvs[5]);
    expect(a.uvs[2]).toBe(a.uvs[8]);
  });

  it("returns null for colinear (degenerate) curves", () => {
    expect(
      quadraticToTriangle({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }),
    ).toBeNull();
  });
});

describe("subdivideCubic", () => {
  it("emits exactly `subdivisions` quadratic triples", () => {
    const segs = subdivideCubic(
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
      8,
    );
    expect(segs.length).toBe(8);
    // Endpoints chain: prev.p2 == next.p0
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]![0]).toEqual(segs[i - 1]![2]);
    }
    // First segment starts at p0; last ends at p3.
    expect(segs[0]![0]).toEqual({ x: 0, y: 0 });
    expect(segs[segs.length - 1]![2]).toEqual({ x: 100, y: 0 });
  });

  it("approximates a cubic within 1 px at 8 subdivisions over a 100-unit S-curve", () => {
    // Symmetric S-shape that exercises the full curvature range.
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 0, y: 100 };
    const p2 = { x: 100, y: 100 };
    const p3 = { x: 100, y: 0 };
    const segs = subdivideCubic(p0, p1, p2, p3, 8);
    // Sample the original cubic at 32 evenly-spaced t and find the
    // closest point on the matching sub-quadratic (each owns a t
    // range [i/8, (i+1)/8]).
    let maxErr = 0;
    for (let i = 0; i < 32; i++) {
      const t = i / 31;
      const orig = cubicAt(p0, p1, p2, p3, t);
      const segIdx = Math.min(7, Math.floor(t * 8));
      const localT = (t - segIdx / 8) * 8; // 0..1 inside the sub-curve
      const [qa, qb, qc] = segs[segIdx]!;
      const approx = quadAt(qa, qb, qc, localT);
      const dx = orig.x - approx.x;
      const dy = orig.y - approx.y;
      const err = Math.hypot(dx, dy);
      if (err > maxErr) maxErr = err;
    }
    expect(maxErr).toBeLessThan(1.0);
  });
});

describe("cubicToTriangles", () => {
  it("returns 8 triangles for a non-degenerate cubic at default subdivisions", () => {
    const tris = cubicToTriangles(
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
    );
    expect(tris.length).toBe(8);
  });

  it("drops degenerate sub-quadratics (colinear)", () => {
    // Pure straight cubic — every sub-quadratic is colinear, so 0 tris emitted.
    const tris = cubicToTriangles(
      { x: 0, y: 0 },
      { x: 25, y: 0 },
      { x: 75, y: 0 },
      { x: 100, y: 0 },
    );
    expect(tris.length).toBe(0);
  });
});

describe("packCurveTriangles", () => {
  it("concatenates N triangles into 6N positions + 9N uvs", () => {
    const t1 = quadraticToTriangle({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 })!;
    const t2 = quadraticToTriangle({ x: 5, y: 0 }, { x: 6, y: 1 }, { x: 7, y: 0 })!;
    const packed = packCurveTriangles([t1, t2]);
    expect(packed.positions.length).toBe(12);
    expect(packed.uvs.length).toBe(18);
    // Second triangle's first vertex should land at index 6 of positions.
    expect(packed.positions[6]).toBe(5);
    expect(packed.positions[7]).toBe(0);
  });

  it("empty input → empty buffers", () => {
    const packed = packCurveTriangles([]);
    expect(packed.positions.length).toBe(0);
    expect(packed.uvs.length).toBe(0);
  });
});
