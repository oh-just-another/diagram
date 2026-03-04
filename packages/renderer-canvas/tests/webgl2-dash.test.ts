import { describe, expect, it } from "vitest";
import { dashPolyline } from "../src/webgl2-target";

/**
 * WebGL2 dashed strokes: `stroke()` splits the polyline into "on" runs
 * via `dashPolyline` (world units, matching Canvas2D's world-space
 * `setLineDash`). This pins that split.
 */
const p = (x: number, y: number) => ({ x, y });
const len = (run: { x: number; y: number }[]) =>
  run.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - run[i]!.x, q.y - run[i]!.y), 0);

describe("dashPolyline", () => {
  it("splits a straight line into on-runs matching the pattern", () => {
    // [on 8, off 4] over a 20-long line → on[0..8], off[8..12], on[12..20].
    const runs = dashPolyline([p(0, 0), p(20, 0)], [8, 4]);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual([p(0, 0), p(8, 0)]);
    expect(runs[1]![0]).toEqual(p(12, 0));
    expect(runs[1]![runs[1]!.length - 1]).toEqual(p(20, 0));
  });

  it("dotted pattern yields many short on-runs", () => {
    const runs = dashPolyline([p(0, 0), p(30, 0)], [2, 4]);
    // period 6 over 30 → on-runs at 0,6,12,18,24 → 5 runs (last starts at 24).
    expect(runs.length).toBeGreaterThanOrEqual(5);
    for (const r of runs) expect(len(r)).toBeLessThanOrEqual(2 + 1e-6);
  });

  it("carries the pattern across polyline vertices (corners)", () => {
    // An L-shape; the dash phase must continue around the bend, not reset.
    const runs = dashPolyline([p(0, 0), p(10, 0), p(10, 10)], [5, 5]);
    // total length 20, period 10 → on at [0..5] and [10..15] → 2 runs.
    expect(runs).toHaveLength(2);
    // second run starts at the corner; on-run [10..15] is along the
    // vertical leg.
    expect(runs[1]![0]).toEqual(p(10, 0));
  });

  it("degenerate pattern (0) returns the whole line (solid)", () => {
    const runs = dashPolyline([p(0, 0), p(10, 0)], [0]);
    expect(runs).toEqual([[p(0, 0), p(10, 0)]]);
  });
});
