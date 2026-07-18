import { describe, expect, it, vi } from "vitest";
import type { AtlasGlyph, GlyphAtlas } from "@oh-just-another/glyph-atlas";
import { measureGlyphRunEm } from "../src/webgl2/webgl2-msdf-text";

/**
 * B7 — single-pass MSDF width measurement.
 *
 * `measureGlyphRunEm` is the one shared implementation of run-width
 * measurement (used by `WebGL2Target.textMetrics` and seeded by
 * `drawText`). It must return the same Σ(advance/unitsPerEm) the layout
 * walk steps the cursor by — so measured width and drawn width stay 1:1 —
 * and memoize per atlas so a repeat measure does no second atlas walk.
 */

const UNITS_PER_EM = 1000;

/** Per-codepoint advance table for a fake monospace-ish font. */
const ADVANCES: Record<number, number> = {
  0x48: 700, // H
  0x65: 500, // e
  0x6c: 220, // l
  0x6f: 560, // o
  0x20: 250, // space (empty glyph)
};

const makeGlyph = (codePoint: number, advance: number): AtlasGlyph => ({
  codePoint,
  atlasX: 0,
  atlasY: 0,
  tileSize: 32,
  range: 4,
  advance,
  bboxXMin: 0,
  bboxYMin: 0,
  bboxW: codePoint === 0x20 ? 0 : 400,
  bboxH: codePoint === 0x20 ? 0 : 700,
  unitsPerEm: UNITS_PER_EM,
  empty: codePoint === 0x20,
});

/**
 * A fresh mock atlas per test — object identity keys the per-atlas memo,
 * so a new instance guarantees a clean cache and no cross-test bleed.
 */
const makeAtlas = (missing: ReadonlySet<number> = new Set()): GlyphAtlas => {
  const getOrRasterize = vi.fn((cp: number, _fontId = 0): AtlasGlyph | null => {
    if (missing.has(cp)) return null;
    const advance = ADVANCES[cp];
    return advance === undefined ? null : makeGlyph(cp, advance);
  });
  return { getOrRasterize } as unknown as GlyphAtlas;
};

/** Reference width: exactly what the layout walk accumulates. */
const referenceWidth = (
  text: string,
  fontSize: number,
  advances: Record<number, number> = ADVANCES,
): number => {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const a = advances[cp];
    if (a === undefined) continue;
    w += (a * fontSize) / UNITS_PER_EM;
  }
  return w;
};

describe("measureGlyphRunEm (B7)", () => {
  it("em-width × fontSize matches the layout-walk width for a set of strings", () => {
    for (const text of ["Hello", "lll", "o o o", "He", "l"]) {
      for (const fontSize of [12, 16, 32.5]) {
        const atlas = makeAtlas();
        const px = measureGlyphRunEm(text, atlas) * fontSize;
        expect(px).toBeCloseTo(referenceWidth(text, fontSize), 9);
      }
    }
  });

  it("returns 0 for the empty string without touching the atlas", () => {
    const atlas = makeAtlas();
    expect(measureGlyphRunEm("", atlas)).toBe(0);
    expect(atlas.getOrRasterize as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("skips glyphs the atlas can't provide (atlas full)", () => {
    // 'e' missing → its advance drops out of the sum, matching the legacy
    // measure loop's `if (!glyph) continue`.
    const atlas = makeAtlas(new Set([0x65]));
    const px = measureGlyphRunEm("Hello", atlas) * 16;
    const advancesNoE = { ...ADVANCES };
    delete advancesNoE[0x65];
    expect(px).toBeCloseTo(referenceWidth("Hello", 16, advancesNoE), 9);
  });

  it("memoizes: a repeat measure does not re-walk the atlas", () => {
    const atlas = makeAtlas();
    const spy = atlas.getOrRasterize as unknown as ReturnType<typeof vi.fn>;
    const first = measureGlyphRunEm("Hello", atlas);
    const callsAfterFirst = spy.mock.calls.length;
    expect(callsAfterFirst).toBe(5); // one per codepoint, single pass
    const second = measureGlyphRunEm("Hello", atlas);
    expect(second).toBe(first);
    // No additional atlas lookups on the memoized hit.
    expect(spy.mock.calls.length).toBe(callsAfterFirst);
  });

  it("keys the memo by fontId (different fonts measured independently)", () => {
    const atlas = makeAtlas();
    const spy = atlas.getOrRasterize as unknown as ReturnType<typeof vi.fn>;
    measureGlyphRunEm("Hi", atlas, 0);
    const afterFont0 = spy.mock.calls.length;
    // fontId 1 is a distinct key → a fresh walk, not a memo hit.
    measureGlyphRunEm("Hi", atlas, 1);
    expect(spy.mock.calls.length).toBeGreaterThan(afterFont0);
  });
});
