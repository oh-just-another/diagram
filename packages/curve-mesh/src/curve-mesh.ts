import { bezier } from "@oh-just-another/math";
import { DEFAULT_CUBIC_SUBDIVISIONS } from "./constants.js";

/** 2D point. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * One quadratic Bezier triangle ready for GPU upload. `positions`
 * are 6 floats (3 vertices × xy), `uvs` are 9 floats (3 vertices ×
 * uvw where w encodes the "fill inside" sign).
 *
 * Vertex layout (Loop-Blinn quadratic):
 *   v0: position = p0; uv = (0, 0)
 *   v1: position = p1; uv = (0.5, 0)
 *   v2: position = p2; uv = (1, 1)
 *
 * Fragment shader:
 *   discard if (uv.u² - uv.v) * uv.w > 0;
 *
 * `w` is +1 when the curve bows away from the convex hull of the
 * triangle (the outside of the parabola gets discarded — convex
 * case) and −1 when it bows the other way (concave case — keep the
 * outside instead).
 */
export interface CurveTriangle {
  readonly positions: Float32Array; // 6 floats
  readonly uvs: Float32Array; // 9 floats
}

/**
 * Emit one Loop-Blinn quadratic-Bezier triangle for the segment
 * `p0 → p2` with control point `p1`. Returns `null` for degenerate
 * (colinear) curves.
 *
 * The triangle covers the convex hull of the three control points;
 * the fragment shader uses the per-vertex (u, v) coordinates to
 * decide which side of the parabola each pixel sits on.
 */
export const quadraticToTriangle = (p0: Point, p1: Point, p2: Point): CurveTriangle | null => {
  // Curvature direction: positive cross product → control point is
  // left of p0→p2, so the parabola bows that way. The sign decides
  // whether the filled region is the outside or inside of the parabola.
  const cross = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
  if (cross === 0) return null; // p1 on line p0p2 — straight segment, no triangle needed
  const w = cross > 0 ? 1 : -1;
  return {
    positions: new Float32Array([p0.x, p0.y, p1.x, p1.y, p2.x, p2.y]),
    uvs: new Float32Array([0, 0, w, 0.5, 0, w, 1, 1, w]),
  };
};

/**
 * Subdivide a cubic Bezier into `n` quadratic Beziers using
 * mid-point De Casteljau. Each sub-cubic is approximated by a single
 * quadratic whose control point is the average of the two inner
 * control points. Returns the list of `(p0, p1, p2)` triples ready
 * to feed into {@link quadraticToTriangle}.
 *
 * The default {@link DEFAULT_CUBIC_SUBDIVISIONS} of 8 keeps the error
 * under 0.5 px at 4× zoom for cubics up to ≈ 200 world units long.
 */
export const subdivideCubic = (
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  subdivisions = DEFAULT_CUBIC_SUBDIVISIONS,
): readonly [Point, Point, Point][] => {
  const segments: [Point, Point, Point][] = [];
  let prevPoint = p0;
  for (let i = 0; i < subdivisions; i++) {
    const t0 = i / subdivisions;
    const t1 = (i + 1) / subdivisions;
    const tMid = (t0 + t1) / 2;
    const endPoint = bezier.cubicAt(p0, p1, p2, p3, t1);
    // Approximate the [t0, t1] sub-cubic with a quadratic whose
    // control point makes it pass through the cubic's midpoint at
    // t = 0.5:
    //   quadAt(0.5) = (start + endPoint) / 4 + control / 2
    //   ⇒ control = 2·midOfCubic - (start + endPoint) / 2
    const cubicMid = bezier.cubicAt(p0, p1, p2, p3, tMid);
    const control = {
      x: 2 * cubicMid.x - (prevPoint.x + endPoint.x) / 2,
      y: 2 * cubicMid.y - (prevPoint.y + endPoint.y) / 2,
    };
    segments.push([prevPoint, control, endPoint]);
    prevPoint = endPoint;
  }
  return segments;
};

/**
 * Emit a triangle list for one cubic Bezier via
 * {@link subdivideCubic} + {@link quadraticToTriangle}. Drops
 * degenerate (colinear) sub-quadratics.
 */
export const cubicToTriangles = (
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  subdivisions = DEFAULT_CUBIC_SUBDIVISIONS,
): readonly CurveTriangle[] => {
  const out: CurveTriangle[] = [];
  for (const [a, b, c] of subdivideCubic(p0, p1, p2, p3, subdivisions)) {
    const tri = quadraticToTriangle(a, b, c);
    if (tri) out.push(tri);
  }
  return out;
};

/**
 * Zero-allocation triangle accumulator for per-frame triangulation.
 *
 * `quadraticToTriangle` / `cubicToTriangles` / `packCurveTriangles`
 * allocate fresh `Float32Array`s per triangle — fine for one-off
 * geometry, but a GC hazard when a renderer re-triangulates every
 * curve every frame. The batch writes triangle data straight into two
 * growable flat buffers (positions 6 floats/triangle, uvs 9
 * floats/triangle) with a cursor, so steady-state cost after warmup is
 * zero allocations.
 *
 * Contract: the `positions` / `uvs` views are valid only until the
 * next `add*` / `reset` call on the same batch — callers that retain
 * the data (e.g. a triangulation cache) must copy it.
 */
export class CurveTriangleBatch {
  private positionsBuf = new Float32Array(INITIAL_BATCH_TRIANGLES * 6);
  private uvsBuf = new Float32Array(INITIAL_BATCH_TRIANGLES * 9);
  private count = 0;

  /** Number of triangles accumulated since the last `reset()`. */
  get triangleCount(): number {
    return this.count;
  }

  /** Flat `[x, y] × 3` per triangle — view valid until the next `add*` / `reset`. */
  get positions(): Float32Array {
    return this.positionsBuf.subarray(0, this.count * 6);
  }

  /** Flat `[u, v, w] × 3` per triangle — view valid until the next `add*` / `reset`. */
  get uvs(): Float32Array {
    return this.uvsBuf.subarray(0, this.count * 9);
  }

  /** Rewind the cursor. Buffers keep their capacity (it only ratchets up). */
  reset(): void {
    this.count = 0;
  }

  /**
   * Append one Loop-Blinn quadratic triangle (same math as
   * {@link quadraticToTriangle}) without allocating. Returns `false`
   * for degenerate (colinear) curves, which emit nothing.
   */
  addQuadratic(p0: Point, p1: Point, p2: Point): boolean {
    const cross = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
    if (cross === 0) return false;
    const w = cross > 0 ? 1 : -1;
    this.ensureCapacity(this.count + 1);
    let po = this.count * 6;
    const positions = this.positionsBuf;
    positions[po++] = p0.x;
    positions[po++] = p0.y;
    positions[po++] = p1.x;
    positions[po++] = p1.y;
    positions[po++] = p2.x;
    positions[po] = p2.y;
    let uo = this.count * 9;
    const uvs = this.uvsBuf;
    uvs[uo++] = 0;
    uvs[uo++] = 0;
    uvs[uo++] = w;
    uvs[uo++] = 0.5;
    uvs[uo++] = 0;
    uvs[uo++] = w;
    uvs[uo++] = 1;
    uvs[uo++] = 1;
    uvs[uo] = w;
    this.count++;
    return true;
  }

  /**
   * Append the triangles for one cubic Bezier via
   * {@link subdivideCubic} + {@link addQuadratic}. Degenerate
   * sub-quadratics are dropped, matching {@link cubicToTriangles}.
   */
  addCubic(
    p0: Point,
    p1: Point,
    p2: Point,
    p3: Point,
    subdivisions = DEFAULT_CUBIC_SUBDIVISIONS,
  ): void {
    for (const [a, b, c] of subdivideCubic(p0, p1, p2, p3, subdivisions)) {
      this.addQuadratic(a, b, c);
    }
  }

  private ensureCapacity(triangles: number): void {
    if (this.positionsBuf.length >= triangles * 6) return;
    let cap = this.positionsBuf.length / 6;
    while (cap < triangles) cap *= 2;
    const nextPositions = new Float32Array(cap * 6);
    nextPositions.set(this.positionsBuf);
    this.positionsBuf = nextPositions;
    const nextUvs = new Float32Array(cap * 9);
    nextUvs.set(this.uvsBuf);
    this.uvsBuf = nextUvs;
  }
}

/**
 * Initial `CurveTriangleBatch` capacity, in triangles. 64 covers a
 * typical fill (a rounded rect is 4, a 12-segment blob ≈ 54) without a
 * grow; capacity doubles on demand and never shrinks.
 */
const INITIAL_BATCH_TRIANGLES = 64;

/**
 * Pack a list of curve triangles into two contiguous Float32Arrays
 * (`positions` 6N, `uvs` 9N) ready for `bufferData(STATIC_DRAW)`.
 *
 * Allocates fresh arrays per call — for zero-allocation per-frame
 * triangulation use {@link CurveTriangleBatch} instead.
 */
export const packCurveTriangles = (
  triangles: readonly CurveTriangle[],
): { positions: Float32Array; uvs: Float32Array } => {
  const positions = new Float32Array(triangles.length * 6);
  const uvs = new Float32Array(triangles.length * 9);
  let posOff = 0;
  let uvOff = 0;
  for (const t of triangles) {
    positions.set(t.positions, posOff);
    uvs.set(t.uvs, uvOff);
    posOff += 6;
    uvOff += 9;
  }
  return { positions, uvs };
};
