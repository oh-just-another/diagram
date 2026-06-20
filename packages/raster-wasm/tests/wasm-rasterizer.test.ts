import { describe, expect, it } from "vitest";
import type { PathCommand } from "@oh-just-another/scene";
import { WasmRasterizer } from "../src/wasm-rasterizer";

describe("WasmRasterizer", () => {
  it("delegates to jsRasterizer.flatten before WASM loads", () => {
    const r = new WasmRasterizer();
    const cmds: PathCommand[] = [
      { kind: "M", to: { x: 0, y: 0 } },
      { kind: "Q", control: { x: 50, y: 100 }, to: { x: 100, y: 0 } },
    ];
    const pts = r.flatten(cmds, 0.5);
    expect(pts.length).toBeGreaterThan(2);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 0 });
  });

  it("delegates to jsRasterizer.strokeToFill before WASM loads", () => {
    const r = new WasmRasterizer();
    const polyline = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const fill = r.strokeToFill(polyline, 4, { cap: "butt", join: "miter" });
    // Two offsets per side + closing point.
    expect(fill.length).toBeGreaterThanOrEqual(4);
  });

  it("reports isReady=false until loadModule succeeds", () => {
    const r = new WasmRasterizer();
    expect(r.isReady).toBe(false);
  });

  it("uses the configured default tolerance", () => {
    const r = new WasmRasterizer({ defaultTolerance: 5 });
    // tolerance=0 means "use default"; coarser tolerance → fewer samples
    const fine = new WasmRasterizer({ defaultTolerance: 0.1 }).flatten(
      [
        { kind: "M", to: { x: 0, y: 0 } },
        {
          kind: "C",
          control1: { x: 0, y: 100 },
          control2: { x: 100, y: 100 },
          to: { x: 100, y: 0 },
        },
      ],
      0,
    );
    const coarse = r.flatten(
      [
        { kind: "M", to: { x: 0, y: 0 } },
        {
          kind: "C",
          control1: { x: 0, y: 100 },
          control2: { x: 100, y: 100 },
          to: { x: 100, y: 0 },
        },
      ],
      0,
    );
    expect(fine.length).toBeGreaterThanOrEqual(coarse.length);
  });

  it("propagates a WASM compile error for non-WASM bytes", async () => {
    const r = new WasmRasterizer();
    const garbage = new Uint8Array([0x6e, 0x6f, 0x70, 0x65]);
    await expect(r.loadModule(garbage)).rejects.toThrow(/magic word|WebAssembly/);
  });
});
