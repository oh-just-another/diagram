import { describe, expect, it } from "vitest";
import type { PathCommand } from "@oh-just-another/scene";
import { jsRasterizer } from "../src/raster/js-rasterizer";
import { getActiveRasterizer, setActiveRasterizer } from "../src/raster/rasterizer";

describe("jsRasterizer.flatten", () => {
  it("passes M and L commands through as polyline points", () => {
    const commands: PathCommand[] = [
      { kind: "M", to: { x: 0, y: 0 } },
      { kind: "L", to: { x: 10, y: 0 } },
      { kind: "L", to: { x: 10, y: 10 } },
    ];
    expect(jsRasterizer.flatten(commands, 0.5)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it("samples quadratic segments between the endpoints", () => {
    const commands: PathCommand[] = [
      { kind: "M", to: { x: 0, y: 0 } },
      { kind: "Q", control: { x: 50, y: 100 }, to: { x: 100, y: 0 } },
    ];
    const pts = jsRasterizer.flatten(commands, 0.5);
    expect(pts.length).toBeGreaterThan(2);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 0 });
    // The curve bulges towards the control point (positive y inside).
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThan(0);
  });

  it("samples cubic segments between the endpoints", () => {
    const commands: PathCommand[] = [
      { kind: "M", to: { x: 0, y: 0 } },
      {
        kind: "C",
        control1: { x: 0, y: 50 },
        control2: { x: 100, y: 50 },
        to: { x: 100, y: 0 },
      },
    ];
    const pts = jsRasterizer.flatten(commands, 0.5);
    expect(pts.length).toBeGreaterThan(2);
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 0 });
  });

  it("a smaller tolerance yields at least as many samples", () => {
    const commands: PathCommand[] = [
      { kind: "M", to: { x: 0, y: 0 } },
      { kind: "Q", control: { x: 50, y: 100 }, to: { x: 100, y: 0 } },
    ];
    const coarse = jsRasterizer.flatten(commands, 10);
    const fine = jsRasterizer.flatten(commands, 0.1);
    expect(fine.length).toBeGreaterThanOrEqual(coarse.length);
  });

  it("Z closes the path back to the first point", () => {
    const commands: PathCommand[] = [
      { kind: "M", to: { x: 1, y: 2 } },
      { kind: "L", to: { x: 5, y: 2 } },
      { kind: "Z" },
    ];
    const pts = jsRasterizer.flatten(commands, 0.5);
    expect(pts[pts.length - 1]).toEqual({ x: 1, y: 2 });
  });

  it("Z on an empty path is a no-op", () => {
    expect(jsRasterizer.flatten([{ kind: "Z" }], 0.5)).toEqual([]);
  });
});

describe("jsRasterizer.strokeToFill", () => {
  it("returns short polylines unchanged", () => {
    const single = [{ x: 3, y: 4 }];
    expect(jsRasterizer.strokeToFill(single, 2)).toBe(single);
    expect(jsRasterizer.strokeToFill([], 2)).toEqual([]);
  });

  it("offsets a horizontal segment by half the width on each side", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const outline = jsRasterizer.strokeToFill(line, 4);
    // 2 left + 2 right + closing point.
    expect(outline).toHaveLength(5);
    const ys = outline.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(-2);
    expect(Math.max(...ys)).toBeCloseTo(2);
    // Closes back to the first outline point.
    expect(outline[outline.length - 1]).toEqual(outline[0]);
  });

  it("builds a closed outline around a polyline corner", () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const outline = jsRasterizer.strokeToFill(poly, 2, { cap: "butt", join: "miter" });
    expect(outline).toHaveLength(7);
    expect(outline[outline.length - 1]).toEqual(outline[0]);
  });

  it("accepts round / square caps without changing vertex count (reference impl)", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(jsRasterizer.strokeToFill(line, 2, { cap: "round" })).toHaveLength(5);
    expect(jsRasterizer.strokeToFill(line, 2, { cap: "square" })).toHaveLength(5);
  });
});

describe("active rasterizer registry", () => {
  it("defaults to null, installs and clears", () => {
    expect(getActiveRasterizer()).toBeNull();
    setActiveRasterizer(jsRasterizer);
    expect(getActiveRasterizer()).toBe(jsRasterizer);
    setActiveRasterizer(null);
    expect(getActiveRasterizer()).toBeNull();
  });
});
