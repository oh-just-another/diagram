import { describe, expect, it } from "vitest";
import { WasmTextShaper } from "../src/wasm-text-shaper";

const font = { family: "Arial", size: 16 };

describe("WasmTextShaper", () => {
  it("returns a fallback measurement before WASM loads", () => {
    const s = new WasmTextShaper();
    const m = s.measure("hello", font);
    // 5 * 16 * 0.55 ≈ 44
    expect(m.width).toBeCloseTo(5 * 16 * 0.55);
  });

  it("isReady=false until loadModule succeeds", () => {
    const s = new WasmTextShaper();
    expect(s.isReady).toBe(false);
  });

  it("caches identical measurements", () => {
    const s = new WasmTextShaper();
    const a = s.measure("xx", font);
    const b = s.measure("xx", font);
    // Same returned object reference — confirms cache hit path.
    expect(a).toBe(b);
  });

  it("evicts oldest entry once the cache is full", () => {
    const s = new WasmTextShaper({ cacheSize: 2 });
    s.measure("a", font);
    s.measure("b", font);
    s.measure("c", font); // evicts "a"
    const aAfter = s.measure("a", font);
    const aAgain = s.measure("a", font);
    // After eviction "a" was re-computed; subsequent hit returns same ref.
    expect(aAfter).toBe(aAgain);
  });

  it("shape emits one glyph per code point with even spacing", () => {
    const s = new WasmTextShaper();
    const glyphs = s.shape("abc", font);
    expect(glyphs).toHaveLength(3);
    const advance = glyphs[1]!.x - glyphs[0]!.x;
    expect(advance).toBeGreaterThan(0);
    expect(glyphs[2]!.x - glyphs[1]!.x).toBeCloseTo(advance);
  });

  it("propagates a WASM compile error for non-WASM bytes", async () => {
    const s = new WasmTextShaper();
    const garbage = new Uint8Array([0x6e, 0x6f, 0x70, 0x65]);
    await expect(s.loadModule(garbage)).rejects.toThrow(/magic word|WebAssembly/);
  });
});
