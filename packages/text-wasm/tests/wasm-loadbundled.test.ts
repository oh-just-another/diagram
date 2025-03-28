import { describe, expect, it } from "vitest";
import { WasmTextShaper } from "../src/wasm-text-shaper";

/**
 * End-to-end check that the bundled `wasm/text_shaper.wasm`
 * actually loads, instantiates, and returns real font-metric
 * widths from Roboto Regular (not the fallback heuristic).
 */

describe("WasmTextShaper.loadBundled (real .wasm)", () => {
  it("loads + isReady=true", async () => {
    const s = await WasmTextShaper.loadBundled();
    expect(s.isReady).toBe(true);
  });

  it('measure("hello", 14px) matches Roboto Regular advance', async () => {
    const s = await WasmTextShaper.loadBundled();
    const m = s.measure("hello", { family: "Roboto", size: 14 });
    // Roboto Regular gives ~29.9 for "hello" at 14px. Allow tiny
    // float drift across rust/wasm builds — 1% tolerance.
    expect(m.width).toBeGreaterThan(29);
    expect(m.width).toBeLessThan(31);
  });

  it("scales linearly with font size", async () => {
    const s = await WasmTextShaper.loadBundled();
    const w14 = s.measure("hello", { family: "Roboto", size: 14 }).width;
    const w28 = s.measure("hello", { family: "Roboto", size: 28 }).width;
    expect(w28).toBeCloseTo(w14 * 2, 1);
  });

  it("returns non-zero for ASCII letters M and i", async () => {
    const s = await WasmTextShaper.loadBundled();
    const wM = s.measure("M", { family: "Roboto", size: 14 }).width;
    const wi = s.measure("i", { family: "Roboto", size: 14 }).width;
    // M is much wider than i in proportional fonts.
    expect(wM).toBeGreaterThan(wi * 2);
  });
});
