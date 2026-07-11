import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Bounds, Transform, Vec2 } from "@oh-just-another/types";
import * as vec2 from "../src/vec2";
import * as matrix from "../src/matrix";
import * as bounds from "../src/bounds";
import * as hitTest from "../src/hit-test";
import * as intersect from "../src/intersect";

/**
 * Property-based invariants (fast-check) for the L0 geometry kernel. These
 * assert algebraic laws that must hold for *any* input, complementing the
 * example-based unit tests. Coordinates are bounded so float error stays
 * comparable across a run; epsilons are scaled by magnitude where needed.
 */

const coord = (): fc.Arbitrary<number> =>
  fc.double({ min: -1e4, max: 1e4, noNaN: true, noDefaultInfinity: true });

const vec = (): fc.Arbitrary<Vec2> => fc.record({ x: coord(), y: coord() });

/** Non-empty axis-aligned bounds (positive width/height). */
const posBounds = (): fc.Arbitrary<Bounds> =>
  fc.record({
    x: coord(),
    y: coord(),
    width: fc.double({ min: 1, max: 1e4, noNaN: true, noDefaultInfinity: true }),
    height: fc.double({ min: 1, max: 1e4, noNaN: true, noDefaultInfinity: true }),
  });

const angle = (): fc.Arbitrary<number> =>
  fc.double({ min: -Math.PI, max: Math.PI, noNaN: true, noDefaultInfinity: true });

/** Scale factor bounded away from zero so the matrix stays invertible. */
const nonZeroScale = (): fc.Arbitrary<number> =>
  fc
    .double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true })
    .chain((m) => fc.constantFrom(m, -m));

const magEps = (...vs: Vec2[]): number => {
  let mag = 1;
  for (const v of vs) mag = Math.max(mag, Math.abs(v.x), Math.abs(v.y));
  return 1e-6 * mag;
};

/**
 * `bounds.containsBounds` with a tolerance: `union` recomputes `width` as
 * `xMax - x`, so re-deriving `maxX` can differ from the input's `maxX` by a
 * few ulps at large coordinates. That float wobble is not a containment
 * failure, so the property checks containment up to `eps`.
 */
const containsWithin = (outer: Bounds, inner: Bounds, eps: number): boolean =>
  inner.x >= outer.x - eps &&
  inner.y >= outer.y - eps &&
  bounds.maxX(inner) <= bounds.maxX(outer) + eps &&
  bounds.maxY(inner) <= bounds.maxY(outer) + eps;

const boundsEps = (...bs: Bounds[]): number => {
  let mag = 1;
  for (const b of bs) {
    mag = Math.max(
      mag,
      Math.abs(b.x),
      Math.abs(b.y),
      Math.abs(bounds.maxX(b)),
      Math.abs(bounds.maxY(b)),
    );
  }
  return 1e-6 * mag;
};

describe("vec2 — property invariants", () => {
  it("rotate then rotate back ≈ identity", () => {
    fc.assert(
      fc.property(vec(), angle(), (v, a) => {
        const round = vec2.rotate(vec2.rotate(v, a), -a);
        expect(vec2.equals(round, v, magEps(v))).toBe(true);
      }),
    );
  });

  it("rotateAround by angle 0 is identity", () => {
    fc.assert(
      fc.property(vec(), vec(), (v, pivot) => {
        const r = vec2.rotateAround(v, pivot, 0);
        expect(vec2.equals(r, v, magEps(v, pivot))).toBe(true);
      }),
    );
  });

  it("rotateAround then rotate back ≈ identity", () => {
    fc.assert(
      fc.property(vec(), vec(), angle(), (v, pivot, a) => {
        const round = vec2.rotateAround(vec2.rotateAround(v, pivot, a), pivot, -a);
        expect(vec2.equals(round, v, magEps(v, pivot))).toBe(true);
      }),
    );
  });

  it("distance is symmetric and non-negative", () => {
    fc.assert(
      fc.property(vec(), vec(), (a, b) => {
        const dab = vec2.distance(a, b);
        const dba = vec2.distance(b, a);
        expect(dab).toBeGreaterThanOrEqual(0);
        expect(Math.abs(dab - dba)).toBeLessThanOrEqual(magEps(a, b));
      }),
    );
  });

  it("normalize yields unit length (or ZERO)", () => {
    fc.assert(
      fc.property(vec(), (v) => {
        // Skip sub-normal magnitudes: `x*x` underflows to a denormal there, so
        // the derived length loses all precision. Such vectors never arise in a
        // diagram (world coords are ~1e±4); it's a float limit, not a bug.
        const mag = vec2.length(v);
        fc.pre(mag === 0 || mag >= 1e-3);
        const n = vec2.normalize(v);
        const len = vec2.length(n);
        // ZERO input → ZERO output (len 0); otherwise unit.
        expect(len === 0 || Math.abs(len - 1) <= 1e-9).toBe(true);
      }),
    );
  });
});

describe("matrix — property invariants", () => {
  it("rotation ∘ inverse rotation ≈ IDENTITY", () => {
    fc.assert(
      fc.property(angle(), (a) => {
        const m = matrix.multiply(matrix.rotation(a), matrix.rotation(-a));
        expect(matrix.equals(m, matrix.IDENTITY, 1e-9)).toBe(true);
      }),
    );
  });

  it("inverse ∘ forward maps a point back to itself", () => {
    fc.assert(
      fc.property(
        coord(),
        coord(),
        angle(),
        nonZeroScale(),
        nonZeroScale(),
        vec(),
        (tx, ty, a, sx, sy, p) => {
          const t: Transform = matrix.multiply(
            matrix.translation(tx, ty),
            matrix.multiply(matrix.rotation(a), matrix.scaling(sx, sy)),
          );
          const round = matrix.applyToPoint(matrix.inverse(t), matrix.applyToPoint(t, p));
          const eps = 1e-6 * Math.max(1, Math.abs(tx), Math.abs(ty), Math.abs(p.x), Math.abs(p.y));
          expect(vec2.equals(round, p, eps)).toBe(true);
        },
      ),
    );
  });

  it("applyToPoint(IDENTITY) is a no-op", () => {
    fc.assert(
      fc.property(vec(), (p) => {
        // Tolerant compare: `0 * y` can yield a signed zero, which is equal in
        // value but trips exact structural equality.
        expect(vec2.equals(matrix.applyToPoint(matrix.IDENTITY, p), p, 0)).toBe(true);
      }),
    );
  });
});

describe("bounds — property invariants", () => {
  it("union is commutative", () => {
    fc.assert(
      fc.property(posBounds(), posBounds(), (a, b) => {
        expect(bounds.equals(bounds.union(a, b), bounds.union(b, a), 1e-9)).toBe(true);
      }),
    );
  });

  it("union contains both inputs", () => {
    fc.assert(
      fc.property(posBounds(), posBounds(), (a, b) => {
        const u = bounds.union(a, b);
        const eps = boundsEps(a, b, u);
        expect(containsWithin(u, a, eps)).toBe(true);
        expect(containsWithin(u, b, eps)).toBe(true);
      }),
    );
  });

  it("union is idempotent", () => {
    fc.assert(
      fc.property(posBounds(), (a) => {
        expect(bounds.equals(bounds.union(a, a), a, 1e-9)).toBe(true);
      }),
    );
  });

  it("intersection is contained in both inputs when non-empty", () => {
    fc.assert(
      fc.property(posBounds(), posBounds(), (a, b) => {
        const i = bounds.intersection(a, b);
        if (i === null) return;
        const eps = boundsEps(a, b, i);
        expect(containsWithin(a, i, eps)).toBe(true);
        expect(containsWithin(b, i, eps)).toBe(true);
      }),
    );
  });
});

describe("hit-test — property invariants", () => {
  it("distanceToSegment ≤ distance to either endpoint, and ≥ 0", () => {
    fc.assert(
      fc.property(vec(), vec(), vec(), (p, a, b) => {
        const d = hitTest.distanceToSegment(p, a, b);
        const eps = magEps(p, a, b);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(vec2.distance(p, a) + eps);
        expect(d).toBeLessThanOrEqual(vec2.distance(p, b) + eps);
      }),
    );
  });

  it("a point on the segment has ~zero distance to it", () => {
    fc.assert(
      fc.property(vec(), vec(), fc.double({ min: 0, max: 1, noNaN: true }), (a, b, t) => {
        const p = vec2.lerp(a, b, t);
        const d = hitTest.distanceToSegment(p, a, b);
        expect(d).toBeLessThanOrEqual(magEps(a, b));
      }),
    );
  });
});

describe("intersect — property invariants", () => {
  /**
   * Symmetric within a tolerance that scales with the intersection point's own
   * magnitude: for near-parallel lines the crossing is far off and
   * ill-conditioned, so the two argument orders round differently — that's
   * numerical sensitivity, not an asymmetry in the algorithm.
   */
  const same = (u: Vec2 | null, v: Vec2 | null, baseEps: number): boolean => {
    if (u === null || v === null) return u === v;
    const scale = 1 + Math.max(Math.abs(u.x), Math.abs(u.y), Math.abs(v.x), Math.abs(v.y));
    return vec2.equals(u, v, baseEps * scale);
  };

  /** Sine of the angle between the two line directions (0 ⇒ parallel). */
  const wellConditioned = (a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean => {
    const da = vec2.normalize(vec2.sub(a2, a1));
    const db = vec2.normalize(vec2.sub(b2, b1));
    return Math.abs(vec2.cross(da, db)) >= 1e-3;
  };

  it("segmentSegment is symmetric under argument-pair order", () => {
    fc.assert(
      fc.property(vec(), vec(), vec(), vec(), (a1, a2, b1, b2) => {
        fc.pre(wellConditioned(a1, a2, b1, b2));
        const ab = intersect.segmentSegment(a1, a2, b1, b2);
        const ba = intersect.segmentSegment(b1, b2, a1, a2);
        expect(same(ab, ba, 1e-6)).toBe(true);
      }),
    );
  });

  it("lineLine is symmetric under argument-pair order", () => {
    fc.assert(
      fc.property(vec(), vec(), vec(), vec(), (a1, a2, b1, b2) => {
        fc.pre(wellConditioned(a1, a2, b1, b2));
        const ab = intersect.lineLine(a1, a2, b1, b2);
        const ba = intersect.lineLine(b1, b2, a1, a2);
        expect(same(ab, ba, 1e-6)).toBe(true);
      }),
    );
  });

  it("a segmentSegment hit lies on both segments", () => {
    fc.assert(
      fc.property(vec(), vec(), vec(), vec(), (a1, a2, b1, b2) => {
        const hit = intersect.segmentSegment(a1, a2, b1, b2);
        if (hit === null) return;
        const eps = magEps(a1, a2, b1, b2, hit);
        // Distance to each finite segment is ~0.
        expect(hitTest.distanceToSegment(hit, a1, a2)).toBeLessThanOrEqual(1e-3 + eps);
        expect(hitTest.distanceToSegment(hit, b1, b2)).toBeLessThanOrEqual(1e-3 + eps);
      }),
    );
  });
});
