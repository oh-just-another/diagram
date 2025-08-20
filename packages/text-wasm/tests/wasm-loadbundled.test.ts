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

  it("glyphMetrics('A') returns sensible font-unit values", async () => {
    const s = await WasmTextShaper.loadBundled();
    const m = s.glyphMetrics("A".charCodeAt(0));
    expect(m).not.toBeNull();
    expect(m!.unitsPerEm).toBe(2048); // Roboto's UPM
    expect(m!.advance).toBeGreaterThan(0);
    expect(m!.bboxW).toBeGreaterThan(0);
    expect(m!.bboxH).toBeGreaterThan(0);
  });

  it("glyphMetrics returns zeros for missing glyph (private-use code point)", async () => {
    const s = await WasmTextShaper.loadBundled();
    const m = s.glyphMetrics(0xe000); // private use area — Roboto has no coverage
    expect(m).not.toBeNull();
    expect(m!.advance).toBe(0);
    expect(m!.bboxW).toBe(0);
  });

  it("rasterizeGlyphMSDF('A', 32, 4) produces a 32×32×3 RGB tile with a plausible inside/outside split", async () => {
    const s = await WasmTextShaper.loadBundled();
    const tile = s.rasterizeGlyphMSDF("A".charCodeAt(0), 32, 4);
    expect(tile).not.toBeNull();
    expect(tile!.atlasSize).toBe(32);
    expect(tile!.range).toBe(4);
    expect(tile!.data.length).toBe(32 * 32 * 3);
    // Count pixels whose median(r,g,b) > 128 (the shader's "inside"
    // test). 'A' is a stroked letter, so the inside should be a
    // meaningful but minority fraction — ~10-40% of the tile.
    let insideCount = 0;
    for (let i = 0; i < tile!.data.length; i += 3) {
      const r = tile!.data[i]!;
      const g = tile!.data[i + 1]!;
      const b = tile!.data[i + 2]!;
      const median = [r, g, b].sort((a, z) => a - z)[1]!;
      if (median > 128) insideCount++;
    }
    const total = 32 * 32;
    expect(insideCount).toBeGreaterThan(total * 0.05);
    expect(insideCount).toBeLessThan(total * 0.6);
    // Top-left corner sits in the `range`-pixel margin → guaranteed
    // outside; median should be < 128.
    const cornerMedian = [tile!.data[0]!, tile!.data[1]!, tile!.data[2]!]
      .sort((a, z) => a - z)[1]!;
    expect(cornerMedian).toBeLessThan(128);
  });

  it("rasterizeGlyphMSDF returns all-zero buffer for whitespace glyph", async () => {
    const s = await WasmTextShaper.loadBundled();
    // Space has no contours → fdsm returns None → all-zero tile.
    const tile = s.rasterizeGlyphMSDF(0x20, 16, 2);
    expect(tile).not.toBeNull();
    expect(tile!.data.every((b) => b === 0)).toBe(true);
  });

  // --- Multi-font (sans / serif / mono) ---

  it("resolveFontId maps CSS family stacks to embedded font ids", async () => {
    const s = await WasmTextShaper.loadBundled();
    expect(s.resolveFontId("system-ui, sans-serif")).toBe(0);
    expect(s.resolveFontId("Georgia, 'Times New Roman', serif")).toBe(1);
    expect(s.resolveFontId("ui-monospace, 'SF Mono', Menlo, monospace")).toBe(2);
    expect(s.resolveFontId("")).toBe(0);
  });

  it("mono font has equal advances for i and M (the proportional fonts don't)", async () => {
    const s = await WasmTextShaper.loadBundled();
    const monoI = s.glyphMetrics("i".charCodeAt(0), 2)!;
    const monoM = s.glyphMetrics("M".charCodeAt(0), 2)!;
    // Roboto Mono is monospaced → identical advances.
    expect(monoM.advance).toBe(monoI.advance);
    // Sans (id 0) is proportional → M much wider than i.
    const sansI = s.glyphMetrics("i".charCodeAt(0), 0)!;
    const sansM = s.glyphMetrics("M".charCodeAt(0), 0)!;
    expect(sansM.advance).toBeGreaterThan(sansI.advance * 1.5);
  });

  it("serif and sans produce different glyph metrics for the same letter", async () => {
    const s = await WasmTextShaper.loadBundled();
    const sansA = s.glyphMetrics("A".charCodeAt(0), 0)!;
    const serifA = s.glyphMetrics("A".charCodeAt(0), 1)!;
    // Different fonts → different outlines → metrics shouldn't match
    // exactly (advance and/or bbox differ).
    const differs =
      sansA.advance !== serifA.advance ||
      sansA.bboxW !== serifA.bboxW ||
      sansA.unitsPerEm !== serifA.unitsPerEm;
    expect(differs).toBe(true);
  });
});
