import { describe, expect, it, vi } from "vitest";
import { GlyphAtlas, type MsdfShaper } from "../src/glyph-atlas";

type GlyphMetrics = NonNullable<ReturnType<MsdfShaper["glyphMetrics"]>>;
type MsdfGlyphTile = NonNullable<ReturnType<MsdfShaper["rasterizeGlyphMSDF"]>>;

/**
 * Synthetic shaper that returns the same metrics plus a tile filled
 * with the code point's low byte. Lets us assert that
 * `getOrRasterize` copies the right bytes into the right place
 * inside the atlas buffer without booting WASM.
 */
const makeFakeShaper = (overrides: Partial<{
  metrics: (cp: number) => GlyphMetrics | null;
  tile: (cp: number, size: number) => MsdfGlyphTile | null;
}> = {}): MsdfShaper => {
  const shaper = {
    glyphMetrics: vi.fn(
      overrides.metrics ?? ((cp: number) => ({
        advance: 100,
        bboxXMin: 0,
        bboxYMin: 0,
        bboxW: cp === 0x20 ? 0 : 80, // space → empty
        bboxH: cp === 0x20 ? 0 : 80,
        unitsPerEm: 1000,
      })),
    ),
    rasterizeGlyphMSDF: vi.fn(
      overrides.tile ?? ((cp: number, size: number) => ({
        atlasSize: size,
        range: 4,
        data: new Uint8Array(size * size * 3).fill(cp & 0xff),
      })),
    ),
  } as unknown as MsdfShaper;
  return shaper;
};

describe("GlyphAtlas", () => {
  it("uniform-grid layout: capacity = (atlasSize/tileSize)^2", () => {
    const atlas = new GlyphAtlas(makeFakeShaper(), {
      atlasSize: 128,
      tileSize: 32,
    });
    expect(atlas.columns).toBe(4);
    expect(atlas.capacity).toBe(16);
  });

  it("rejects atlasSize not divisible by tileSize", () => {
    expect(
      () => new GlyphAtlas(makeFakeShaper(), { atlasSize: 100, tileSize: 32 }),
    ).toThrow(/multiple of tileSize/);
  });

  it("caches per-glyph slots; second lookup is a hit", () => {
    const shaper = makeFakeShaper();
    const atlas = new GlyphAtlas(shaper, { atlasSize: 128, tileSize: 32 });
    const first = atlas.getOrRasterize(0x41); // 'A'
    const second = atlas.getOrRasterize(0x41);
    expect(first).toEqual(second);
    expect(atlas.glyphCount).toBe(1);
    expect(shaper.rasterizeGlyphMSDF).toHaveBeenCalledTimes(1);
  });

  it("places successive glyphs in row-major slots", () => {
    const atlas = new GlyphAtlas(makeFakeShaper(), { atlasSize: 128, tileSize: 32 });
    const a = atlas.getOrRasterize(0x41)!;
    const b = atlas.getOrRasterize(0x42)!;
    const c = atlas.getOrRasterize(0x43)!;
    const d = atlas.getOrRasterize(0x44)!;
    const e = atlas.getOrRasterize(0x45)!;
    expect([a.atlasX, a.atlasY]).toEqual([0, 0]);
    expect([b.atlasX, b.atlasY]).toEqual([32, 0]);
    expect([c.atlasX, c.atlasY]).toEqual([64, 0]);
    expect([d.atlasX, d.atlasY]).toEqual([96, 0]);
    // Wraps to second row.
    expect([e.atlasX, e.atlasY]).toEqual([0, 32]);
  });

  it("blits the tile MSDF into the right region of the atlas buffer", () => {
    const atlas = new GlyphAtlas(makeFakeShaper(), { atlasSize: 64, tileSize: 32 });
    const a = atlas.getOrRasterize(0x41)!; // tile filled with 0x41
    const b = atlas.getOrRasterize(0x42)!; // tile filled with 0x42
    void a;
    void b;
    // Atlas: row 0 columns 0-31 = 0x41; columns 32-63 = 0x42.
    const buf = atlas.cpuBuffer;
    // First texel of A (row 0, col 0):
    expect(buf[0]).toBe(0x41);
    // First texel of B (row 0, col 32):
    expect(buf[32 * 3]).toBe(0x42);
    // Centre of A (row 16, col 16):
    expect(buf[(16 * 64 + 16) * 3]).toBe(0x41);
    // Centre of B (row 16, col 48):
    expect(buf[(16 * 64 + 48) * 3]).toBe(0x42);
  });

  it("empty glyph (whitespace) is cached but leaves its tile zero", () => {
    const atlas = new GlyphAtlas(makeFakeShaper(), { atlasSize: 64, tileSize: 32 });
    const space = atlas.getOrRasterize(0x20)!;
    expect(space.empty).toBe(true);
    expect(space.advance).toBe(100); // metrics still carried
    expect(space.bboxW).toBe(0);
    // Tile (slot 0) untouched — all zeros.
    const buf = atlas.cpuBuffer;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        expect(buf[(y * 64 + x) * 3]).toBe(0);
      }
    }
  });

  it("returns null once the atlas is full", () => {
    const atlas = new GlyphAtlas(makeFakeShaper(), { atlasSize: 32, tileSize: 32 });
    expect(atlas.capacity).toBe(1);
    expect(atlas.getOrRasterize(0x41)).not.toBeNull();
    expect(atlas.getOrRasterize(0x42)).toBeNull();
    // Already-cached glyph still resolves.
    expect(atlas.getOrRasterize(0x41)).not.toBeNull();
  });

  it("returns null when the shaper has no glyphMetrics", () => {
    const stub = { glyphMetrics: () => null } as unknown as MsdfShaper;
    const atlas = new GlyphAtlas(stub);
    expect(atlas.getOrRasterize(0x41)).toBeNull();
  });

  it("uploadTo first call does a full texImage2D, subsequent dirty-only", () => {
    const shaper = makeFakeShaper();
    const atlas = new GlyphAtlas(shaper, { atlasSize: 64, tileSize: 32 });
    atlas.getOrRasterize(0x41);

    const gl = makeFakeGl();
    const tex = atlas.uploadTo(gl);
    expect(tex).toBeTruthy();
    expect(gl.texImage2D).toHaveBeenCalledOnce();
    expect(gl.texSubImage2D).not.toHaveBeenCalled();

    // No new glyphs → no upload.
    atlas.uploadTo(gl);
    expect(gl.texImage2D).toHaveBeenCalledOnce();
    expect(gl.texSubImage2D).not.toHaveBeenCalled();

    // Add a glyph → one texSubImage2D for the dirty tile.
    atlas.getOrRasterize(0x42);
    atlas.uploadTo(gl);
    expect(gl.texImage2D).toHaveBeenCalledOnce();
    expect(gl.texSubImage2D).toHaveBeenCalledOnce();
  });

  it("dispose releases the GPU texture and forces a full re-upload next time", () => {
    const atlas = new GlyphAtlas(makeFakeShaper(), { atlasSize: 64, tileSize: 32 });
    atlas.getOrRasterize(0x41);
    const gl = makeFakeGl();
    atlas.uploadTo(gl);
    atlas.dispose(gl);
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
    atlas.uploadTo(gl);
    expect(gl.texImage2D).toHaveBeenCalledTimes(2); // full again
  });
});

/**
 * Minimal WebGL2-shaped object — only the calls GlyphAtlas makes.
 * vi.fn'd so we can assert call counts / arguments without booting
 * a real GPU.
 */
const makeFakeGl = () => {
  const fake = {
    TEXTURE_2D: 1,
    TEXTURE_MIN_FILTER: 2,
    TEXTURE_MAG_FILTER: 3,
    TEXTURE_WRAP_S: 4,
    TEXTURE_WRAP_T: 5,
    LINEAR: 6,
    CLAMP_TO_EDGE: 7,
    RGB8: 8,
    RGB: 9,
    UNSIGNED_BYTE: 10,
    UNPACK_ALIGNMENT: 11,
    UNPACK_ROW_LENGTH: 12,
    UNPACK_SKIP_PIXELS: 13,
    UNPACK_SKIP_ROWS: 14,
    createTexture: vi.fn(() => ({} as WebGLTexture)),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    texSubImage2D: vi.fn(),
    pixelStorei: vi.fn(),
    deleteTexture: vi.fn(),
  };
  return fake as unknown as WebGL2RenderingContext & typeof fake;
};
