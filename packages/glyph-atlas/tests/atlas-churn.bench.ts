import { bench, describe } from "vitest";
import { GlyphAtlas, type MsdfShaper } from "../src/glyph-atlas";

/**
 * Micro-bench for GlyphAtlas cache bookkeeping under churn:
 *
 *   1. steady state — every `getOrRasterize` is a Map hit (the shape of
 *      a warm frame re-rendering a stable glyph set);
 *   2. cold bake — a fresh atlas fills all its slots (key packing, slot
 *      allocation, per-row blit into the CPU buffer, dirty-tile set);
 *   3. overflow — requests past capacity that hit the `null` fast path
 *      (the atlas has no eviction: once full, unseen glyphs stay null).
 *
 * The shaper is a stub returning shared, pre-built metrics/tile objects
 * so raster cost is ~zero and the numbers isolate the atlas's own
 * bookkeeping. GPU upload (`uploadTo`) needs a GL context and is
 * excluded — it's incremental texSubImage2D measured in the browser.
 */

/** Small atlas so a full fill/overflow cycle stays micro-bench sized. */
const ATLAS_SIZE = 256;
const TILE_SIZE = 32; // → 8 × 8 grid, CAPACITY = 64 slots
const RANGE = 4;
const CAPACITY = (ATLAS_SIZE / TILE_SIZE) ** 2;
/** Churn workload: 1.5× capacity unique codepoints → 64 bakes + 32 nulls. */
const CHURN_UNIQUE = CAPACITY + CAPACITY / 2;
/** First bench codepoint ('A' onward — any printable run works). */
const BASE_CODEPOINT = 0x41;

/** Shared fixtures so the stub shaper allocates nothing per call. */
const METRICS = {
  advance: 600,
  bboxXMin: 20,
  bboxYMin: -10,
  bboxW: 560,
  bboxH: 700,
  unitsPerEm: 1000,
} as const;
const TILE = {
  atlasSize: TILE_SIZE,
  range: RANGE,
  data: new Uint8Array(TILE_SIZE * TILE_SIZE * 3).fill(0x80),
} as const;

const stubShaper: MsdfShaper = {
  glyphMetrics: () => METRICS,
  rasterizeGlyphMSDF: () => TILE,
};

/** Pre-filled atlas so the steady-state bench measures pure cache hits. */
const warmAtlas = new GlyphAtlas(stubShaper, {
  atlasSize: ATLAS_SIZE,
  tileSize: TILE_SIZE,
  range: RANGE,
});
for (let i = 0; i < CAPACITY; i++) warmAtlas.getOrRasterize(BASE_CODEPOINT + i);

/** Pre-warmed full atlas for the overflow (null fast path) bench. */
const fullAtlas = new GlyphAtlas(stubShaper, {
  atlasSize: ATLAS_SIZE,
  tileSize: TILE_SIZE,
  range: RANGE,
});
for (let i = 0; i < CAPACITY; i++) fullAtlas.getOrRasterize(BASE_CODEPOINT + i);

describe("GlyphAtlas — getOrRasterize churn (64-slot atlas)", () => {
  bench("64 lookups, 100% cache hits (steady state)", () => {
    for (let i = 0; i < CAPACITY; i++) {
      warmAtlas.getOrRasterize(BASE_CODEPOINT + i);
    }
  });

  bench("96 unique glyphs on a fresh atlas (64 bakes + 32 overflow nulls)", () => {
    const cold = new GlyphAtlas(stubShaper, {
      atlasSize: ATLAS_SIZE,
      tileSize: TILE_SIZE,
      range: RANGE,
    });
    for (let i = 0; i < CHURN_UNIQUE; i++) {
      cold.getOrRasterize(BASE_CODEPOINT + i);
    }
  });

  bench("64 unseen codepoints on a full atlas (null fast path)", () => {
    for (let i = 0; i < CAPACITY; i++) {
      // Offset past everything baked above so each request misses the
      // cache and takes the capacity-exhausted early return.
      fullAtlas.getOrRasterize(BASE_CODEPOINT + CHURN_UNIQUE + i);
    }
  });
});
