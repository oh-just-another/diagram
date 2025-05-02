import { describe, expect, it } from "vitest";
import type { AtlasGlyph } from "@oh-just-another/glyph-atlas";
import { glyphQuadGeometry } from "../src/webgl2-msdf-text";

/**
 * Pins the screen-space + UV math used by `MsdfTextPipeline.drawText`:
 *
 *   1. `marginPx` dimensioning (controls quad size after MSDF).
 *   2. UV layout assumes v=0 is the top of the glyph in the atlas
 *      (atlas y=0 is the glyph top after the Rust transform's y-flip).
 *   3. UV covers only the used tile area, not the whole tile, so narrow
 *      letters like 'i'/'l' are not stretched across an oversize quad.
 */

// Square-aspect glyph (roughly 'A' shape): bbox is wider+taller, fills
// most of the tile.
const wideGlyph: AtlasGlyph = {
  codePoint: 0x41,
  atlasX: 0,
  atlasY: 0,
  tileSize: 32,
  range: 4,
  advance: 1500,
  bboxXMin: 0,
  bboxYMin: 0,
  bboxW: 1500,
  bboxH: 1500,
  unitsPerEm: 2048,
  empty: false,
};

// Narrow glyph ('i'-like): bbox width is 1/8 of height, leaves most
// of the tile horizontally empty in the atlas.
const narrowGlyph: AtlasGlyph = {
  ...wideGlyph,
  codePoint: 0x69,
  bboxW: 200,
  bboxH: 1500,
};

const atlas = { atlasSize: 2048, tileSize: 32, range: 4 };

describe("glyphQuadGeometry — wide glyph", () => {
  it("quad width tracks the glyph's physical screen size + range margin", () => {
    const g = glyphQuadGeometry(wideGlyph, 100, 50, 14, atlas);
    // unitToPx = 14 / 2048 ≈ 0.00684
    // fontUnitsPerAtlasPx = max(1500, 1500) / (32 - 8) = 62.5
    // marginPx = 4 * 62.5 * 0.00684 ≈ 1.71
    // bboxW * unitToPx ≈ 10.25; quad width ≈ 13.67
    const width = g.right - g.left;
    expect(width).toBeGreaterThan(13);
    expect(width).toBeLessThan(14.5);
    expect(width).toBeLessThan(50);
  });

  it("UV covers nearly the full tile for a square-aspect glyph (minus half-pixel inset on each edge)", () => {
    const g = glyphQuadGeometry(wideGlyph, 0, 0, 14, atlas);
    const uWidthAtlas = (g.u1 - g.u0) * atlas.atlasSize;
    const vHeightAtlas = (g.v1 - g.v0) * atlas.atlasSize;
    // Used atlas rect = 32 px; inset of 0.5 px on each side → 31 px.
    // Inset prevents LINEAR-filter bleeding between adjacent tiles.
    expect(uWidthAtlas).toBeCloseTo(31, 1);
    expect(vHeightAtlas).toBeCloseTo(31, 1);
  });

  it("v0 is the top of the glyph (no upside-down y-flip)", () => {
    const g = glyphQuadGeometry(wideGlyph, 0, 0, 14, atlas);
    // Top-vertex UV (v0) < bottom-vertex UV (v1) in y-down atlas
    // coords — atlas y=0 is the top of the glyph after the Rust
    // transform's y-flip.
    expect(g.v0).toBeLessThan(g.v1);
  });
});

describe("glyphQuadGeometry — narrow glyph", () => {
  it("UV does NOT cover the empty atlas margin on the wide axis", () => {
    const g = glyphQuadGeometry(narrowGlyph, 0, 0, 14, atlas);
    const uWidthAtlas = (g.u1 - g.u0) * atlas.atlasSize;
    const vHeightAtlas = (g.v1 - g.v0) * atlas.atlasSize;
    // fontUnitsPerAtlasPx = max(200, 1500) / 24 = 62.5
    // Used atlas width = 200/62.5 + 8 = 11.2, minus 2*0.5 inset = 10.2
    // Used atlas height = 1500/62.5 + 8 = 32, minus inset = 31
    expect(uWidthAtlas).toBeCloseTo(10.2, 1);
    expect(vHeightAtlas).toBeCloseTo(31, 1);
    expect(uWidthAtlas).toBeLessThan(20);
  });

  it("quad width stays proportional to bboxW (no horizontal stretch)", () => {
    const wideG = glyphQuadGeometry(wideGlyph, 0, 0, 14, atlas);
    const narrowG = glyphQuadGeometry(narrowGlyph, 0, 0, 14, atlas);
    const wideWidth = wideG.right - wideG.left;
    const narrowWidth = narrowG.right - narrowG.left;
    // Narrow glyph's bbox is 200/1500 = 13.3% of wide's.
    // Width ratio tracks the bbox ratio within constant margin overhead.
    // At 14-px font the margin is ≈ 1.7 px, so narrow width ≈
    // (200/2048)*14 + 2*1.7 ≈ 4.8.
    expect(narrowWidth).toBeLessThan(wideWidth * 0.4);
    expect(narrowWidth).toBeGreaterThan(1);
  });
});

describe("glyphQuadGeometry — zoom invariance", () => {
  it("quad width scales linearly with fontSize", () => {
    const a = glyphQuadGeometry(wideGlyph, 0, 0, 14, atlas);
    const b = glyphQuadGeometry(wideGlyph, 0, 0, 140, atlas);
    const wA = a.right - a.left;
    const wB = b.right - b.left;
    // 10× font size → 10× quad width
    expect(wB / wA).toBeCloseTo(10, 1);
  });

  it("UV stays identical across font sizes (atlas content doesn't change)", () => {
    const a = glyphQuadGeometry(wideGlyph, 0, 0, 14, atlas);
    const b = glyphQuadGeometry(wideGlyph, 0, 0, 140, atlas);
    expect(b.u0).toBe(a.u0);
    expect(b.u1).toBe(a.u1);
    expect(b.v0).toBe(a.v0);
    expect(b.v1).toBe(a.v1);
  });
});

describe("glyphQuadGeometry — cursor placement", () => {
  it("translates with cursorX / cursorY", () => {
    const a = glyphQuadGeometry(wideGlyph, 0, 0, 14, atlas);
    const b = glyphQuadGeometry(wideGlyph, 100, 50, 14, atlas);
    expect(b.left - a.left).toBeCloseTo(100, 5);
    expect(b.top - a.top).toBeCloseTo(50, 5);
  });
});
