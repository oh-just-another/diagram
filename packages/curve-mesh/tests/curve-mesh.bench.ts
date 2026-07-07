import { bench, describe } from "vitest";
import {
  cubicToTriangles,
  CurveTriangleBatch,
  packCurveTriangles,
  quadraticToTriangle,
  type CurveTriangle,
  type Point,
} from "../src/curve-mesh";

/**
 * Per-frame triangulation cost: the allocating chain
 * (`quadraticToTriangle` / `cubicToTriangles` → `packCurveTriangles`)
 * vs the zero-allocation `CurveTriangleBatch`. Mirrors what
 * `LoopBlinnCurvePipeline.draw` does per fill.
 */

const q = (x: number): [Point, Point, Point] => [
  { x, y: 0 },
  { x: x + 5, y: 10 },
  { x: x + 10, y: 0 },
];

const c = (x: number): [Point, Point, Point, Point] => [
  { x, y: 0 },
  { x, y: 100 },
  { x: x + 100, y: 100 },
  { x: x + 100, y: 0 },
];

// 1k rounded rects — 4 quadratic corners each.
const quads: [Point, Point, Point][] = [];
for (let i = 0; i < 4000; i++) quads.push(q(i * 13));
// 300 path blobs — 6 cubics each (as in the path-heavy scene shape).
const cubics: [Point, Point, Point, Point][] = [];
for (let i = 0; i < 1800; i++) cubics.push(c(i * 29));

const batch = new CurveTriangleBatch();

describe("triangulate 4k quadratics (1k rounded rects)", () => {
  bench("allocating chain (quadraticToTriangle + pack)", () => {
    const tris: CurveTriangle[] = [];
    for (const [p0, p1, p2] of quads) {
      const tri = quadraticToTriangle(p0, p1, p2);
      if (tri) tris.push(tri);
    }
    packCurveTriangles(tris);
  });
  bench("CurveTriangleBatch", () => {
    batch.reset();
    for (const [p0, p1, p2] of quads) batch.addQuadratic(p0, p1, p2);
  });
});

describe("triangulate 1.8k cubics (300 paths x 6 cubics)", () => {
  bench("allocating chain (cubicToTriangles + pack)", () => {
    const tris: CurveTriangle[] = [];
    for (const [p0, p1, p2, p3] of cubics) {
      for (const tri of cubicToTriangles(p0, p1, p2, p3)) tris.push(tri);
    }
    packCurveTriangles(tris);
  });
  bench("CurveTriangleBatch", () => {
    batch.reset();
    for (const [p0, p1, p2, p3] of cubics) batch.addCubic(p0, p1, p2, p3);
  });
});
