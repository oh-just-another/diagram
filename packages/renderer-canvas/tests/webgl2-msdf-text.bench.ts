import { bench, describe } from "vitest";
import type { AtlasGlyph, GlyphAtlas } from "@oh-just-another/glyph-atlas";
import { glyphQuadGeometry, measureGlyphRunEm } from "../src/webgl2-msdf-text";

/**
 * Micro-bench for the CPU side of the MSDF text pipeline:
 *
 *   1. the glyph-run walk + quad packing `drawText` performs per string
 *      (codepoint iteration → atlas lookup → `glyphQuadGeometry` →
 *      24 floats into a pre-grown vertex buffer);
 *   2. `measureGlyphRunEm` with the `runEmWidthMemo` warm (O(1) hit)
 *      vs cold (full codepoint walk + memo insert).
 *
 * The GL half of `drawText` (bufferData / uniforms / drawArrays) is not
 * exercisable in Node and is deliberately excluded — the atlas is a
 * stub whose `getOrRasterize` is a pure pre-warmed Map hit, so the
 * numbers isolate the per-frame JS cost, not raster or upload cost.
 */

/** Short-line scale: one label / one row of text (~64 chars). */
const LINE = "The quick brown fox jumps over the lazy dog 0123456789 END.";
/** Paragraph scale: ~1k chars, a large sticky-note worth of text. */
const PARAGRAPH = LINE.repeat(17); // 60 × 17 = 1020 chars

const UNITS_PER_EM = 1000;
const FONT_SIZE = 16;

const makeGlyph = (codePoint: number): AtlasGlyph => ({
  codePoint,
  atlasX: (codePoint % 32) * 64,
  atlasY: Math.floor(codePoint / 32) * 64,
  tileSize: 64,
  range: 8,
  advance: 400 + (codePoint % 7) * 50,
  bboxXMin: 20,
  bboxYMin: -10,
  bboxW: codePoint === 0x20 ? 0 : 380,
  bboxH: codePoint === 0x20 ? 0 : 700,
  unitsPerEm: UNITS_PER_EM,
  empty: codePoint === 0x20,
});

/**
 * Stub atlas whose `getOrRasterize` is a pre-warmed Map hit — the
 * steady state of a real atlas after the first frame. fontId is
 * ignored: metrics don't matter to timing, only the lookup shape does.
 */
const glyphCache = new Map<number, AtlasGlyph>();
for (const ch of LINE) {
  const cp = ch.codePointAt(0);
  if (cp !== undefined && !glyphCache.has(cp)) glyphCache.set(cp, makeGlyph(cp));
}
const atlas = {
  atlasSize: 2048,
  tileSize: 64,
  range: 8,
  getOrRasterize: (cp: number, _fontId = 0): AtlasGlyph | null => glyphCache.get(cp) ?? null,
} as unknown as GlyphAtlas;

/**
 * The CPU loop of `drawText`, minus GL: walk codepoints, resolve the
 * glyph, compute the quad, pack 6 vertices × (x, y, u, v). Buffer is
 * pre-grown for the paragraph so no bench iteration ever reallocates.
 */
const FLOATS_PER_GLYPH = 24;
const vertexBuf = new Float32Array(PARAGRAPH.length * FLOATS_PER_GLYPH);
const packRun = (text: string): number => {
  let cursor = 0;
  let writeOffset = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const glyph = atlas.getOrRasterize(cp, 0);
    if (!glyph) break;
    const advancePx = (glyph.advance * FONT_SIZE) / glyph.unitsPerEm;
    if (glyph.empty) {
      cursor += advancePx;
      continue;
    }
    const q = glyphQuadGeometry(glyph, cursor, 100, FONT_SIZE, atlas);
    vertexBuf.set(
      // prettier-ignore
      [
        q.left, q.top, q.u0, q.v0,
        q.right, q.top, q.u1, q.v0,
        q.left, q.bottom, q.u0, q.v1,
        q.right, q.top, q.u1, q.v0,
        q.right, q.bottom, q.u1, q.v1,
        q.left, q.bottom, q.u0, q.v1,
      ],
      writeOffset,
    );
    writeOffset += FLOATS_PER_GLYPH;
    cursor += advancePx;
  }
  return cursor;
};

// Pre-warm the width memo for fontId 0 so the "memo hit" benches
// measure steady state; cold benches rotate fontId to force a fresh
// memo key (and thus a full walk) every iteration.
measureGlyphRunEm(LINE, atlas, 0);
measureGlyphRunEm(PARAGRAPH, atlas, 0);
let coldFontId = 1;

describe("MSDF text — glyph-run walk + quad packing (CPU only)", () => {
  bench("pack 64-char line", () => {
    packRun(LINE);
  });

  bench("pack 1k-char paragraph", () => {
    packRun(PARAGRAPH);
  });
});

describe("measureGlyphRunEm — runEmWidthMemo hit vs cold walk", () => {
  bench("64-char line, memo hit", () => {
    measureGlyphRunEm(LINE, atlas, 0);
  });

  bench("64-char line, cold (fresh fontId key)", () => {
    measureGlyphRunEm(LINE, atlas, coldFontId++);
  });

  bench("1k-char paragraph, memo hit", () => {
    measureGlyphRunEm(PARAGRAPH, atlas, 0);
  });

  bench("1k-char paragraph, cold (fresh fontId key)", () => {
    measureGlyphRunEm(PARAGRAPH, atlas, coldFontId++);
  });
});
