import { describe, expect, it } from "vitest";
import {
  cubicToTriangles,
  packCurveTriangles,
  quadraticToTriangle,
} from "@oh-just-another/curve-mesh";
import { triangulateCached, type CurveSegment } from "../src/webgl2-curve";
import { WEBGL2_CURVE_TRIANGULATION_CACHE_CAP } from "../src/constants";

/**
 * The WebGL2 curve pipeline caches Loop-Blinn triangulations by
 * control-point content (LRU, `WEBGL2_CURVE_TRIANGULATION_CACHE_CAP`).
 * These tests pin the cache contract without needing a GL context —
 * `triangulateCached` is the pure data half of `LoopBlinnCurvePipeline.draw`.
 */

const quad = (x: number): CurveSegment => ({
  kind: "q",
  points: [
    { x, y: 0 },
    { x: x + 5, y: 10 },
    { x: x + 10, y: 0 },
  ],
});

const roundedRectCurves = (offset: number): CurveSegment[] => [
  quad(offset),
  quad(offset + 100),
  quad(offset + 200),
  quad(offset + 300),
];

describe("triangulateCached", () => {
  it("matches the uncached triangulation for quadratics", () => {
    const seg = quad(1234.5);
    const { positions, uvs } = triangulateCached([seg]);
    const [p0, p1, p2] = seg.points;
    const tri = quadraticToTriangle(p0!, p1!, p2!)!;
    expect(Array.from(positions)).toEqual(Array.from(tri.positions));
    expect(Array.from(uvs)).toEqual(Array.from(tri.uvs));
  });

  it("matches the uncached triangulation for cubics", () => {
    const seg: CurveSegment = {
      kind: "c",
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 0 },
      ],
    };
    const { positions, uvs } = triangulateCached([seg]);
    const [p0, p1, p2, p3] = seg.points;
    const packed = packCurveTriangles(cubicToTriangles(p0!, p1!, p2!, p3!));
    expect(Array.from(positions)).toEqual(Array.from(packed.positions));
    expect(Array.from(uvs)).toEqual(Array.from(packed.uvs));
  });

  it("returns the same cached buffers for equal geometry in fresh arrays", () => {
    // Same control points, new CurveSegment / array objects — content
    // keying must hit regardless of object identity.
    const a = triangulateCached(roundedRectCurves(5000));
    const b = triangulateCached(roundedRectCurves(5000));
    expect(b.positions).toBe(a.positions);
    expect(b.uvs).toBe(a.uvs);
  });

  it("distinguishes different geometry", () => {
    const a = triangulateCached(roundedRectCurves(6000));
    const b = triangulateCached(roundedRectCurves(6001));
    expect(b.positions).not.toBe(a.positions);
    expect(Array.from(b.positions)).not.toEqual(Array.from(a.positions));
  });

  it("distinguishes quadratic from cubic segments over the same points", () => {
    const points = [
      { x: 7000, y: 0 },
      { x: 7005, y: 10 },
      { x: 7010, y: 0 },
      { x: 7015, y: 10 },
    ];
    const q = triangulateCached([{ kind: "q", points: points.slice(0, 3) }]);
    const c = triangulateCached([{ kind: "c", points }]);
    expect(c.positions).not.toBe(q.positions);
    expect(c.positions.length).not.toBe(q.positions.length);
  });

  it("caches fully-degenerate (empty) triangulations too", () => {
    const flat: CurveSegment = {
      kind: "q",
      points: [
        { x: 8000, y: 0 },
        { x: 8005, y: 0 },
        { x: 8010, y: 0 },
      ],
    };
    const a = triangulateCached([flat]);
    expect(a.positions.length).toBe(0);
    const b = triangulateCached([flat]);
    expect(b.positions).toBe(a.positions);
  });

  it("evicts the least-recently-used entry past the cap", () => {
    const first = roundedRectCurves(-9000);
    const before = triangulateCached(first);
    // Insert `cap` more distinct geometries so `first` falls off the LRU.
    for (let i = 0; i < WEBGL2_CURVE_TRIANGULATION_CACHE_CAP + 1; i++) {
      triangulateCached([quad(i * 17 + 0.25)]);
    }
    const after = triangulateCached(first);
    // Recomputed — a fresh entry with equal content but new buffers.
    expect(after.positions).not.toBe(before.positions);
    expect(Array.from(after.positions)).toEqual(Array.from(before.positions));
  });
});
