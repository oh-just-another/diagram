import { describe, expect, it } from "vitest";
import { WasmRasterizer } from "../src/wasm-rasterizer";

/**
 * End-to-end check for `WasmRasterizer.loadBundled()` — verifies the
 * bezier flatten reaches the wasm and returns a real polyline (not
 * jsRasterizer's fallback).
 */

describe("WasmRasterizer.loadBundled (real .wasm)", () => {
  it("loads and reports isReady=true", async () => {
    const r = await WasmRasterizer.loadBundled();
    expect(r.isReady).toBe(true);
  });

  it("flattens a cubic curve into >2 polyline points", async () => {
    const r = await WasmRasterizer.loadBundled();
    const pts = r.flatten(
      [
        { kind: "M", to: { x: 0, y: 0 } },
        {
          kind: "C",
          control1: { x: 0, y: 100 },
          control2: { x: 100, y: 100 },
          to: { x: 100, y: 0 },
        },
      ],
      1,
    );
    expect(pts.length).toBeGreaterThan(2);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 0 });
  });

  it("flattens a quadratic curve", async () => {
    const r = await WasmRasterizer.loadBundled();
    const pts = r.flatten(
      [
        { kind: "M", to: { x: 0, y: 0 } },
        { kind: "Q", control: { x: 50, y: 100 }, to: { x: 100, y: 0 } },
      ],
      1,
    );
    expect(pts.length).toBeGreaterThan(2);
  });

  it("strokeToFill yields a closed polygon at least 2× the input", async () => {
    const r = await WasmRasterizer.loadBundled();
    const polygon = r.strokeToFill(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      10,
    );
    expect(polygon.length).toBeGreaterThanOrEqual(4);
  });
});
