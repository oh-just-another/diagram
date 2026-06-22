import { DEFAULT_ATLAS_SIZE, DEFAULT_RANGE, DEFAULT_TILE_SIZE } from "./constants.js";

/**
 * Minimum interface a shaper must satisfy to back a {@link GlyphAtlas}.
 * Declared here so the atlas carries no dependency on any concrete MSDF
 * backend — hosts can plug in whichever one they ship.
 */
export interface MsdfShaper {
  glyphMetrics(
    codePoint: number,
    fontId?: number,
  ): {
    readonly advance: number;
    readonly bboxXMin: number;
    readonly bboxYMin: number;
    readonly bboxW: number;
    readonly bboxH: number;
    readonly unitsPerEm: number;
  } | null;
  rasterizeGlyphMSDF(
    codePoint: number,
    atlasSize: number,
    range: number,
    fontId?: number,
  ): {
    readonly atlasSize: number;
    readonly range: number;
    readonly data: Uint8Array;
  } | null;
  /**
   * Resolve a CSS font-family stack (+ bold/italic) to the shaper's font
   * id. Optional — single-font shapers omit it and everything stays
   * font id 0.
   */
  resolveFontId?(family: string, bold?: boolean, italic?: boolean): number;
}

/**
 * A single glyph's placement inside the atlas, plus enough metric
 * information to position its render quad in screen space.
 *
 * `atlasX` / `atlasY` are texel coordinates of the tile's top-left
 * corner inside the atlas texture; `tileSize` is the full edge in
 * texels (covers the SDF range margin too). `range` is the SDF
 * range the tile was generated with — the shader needs it to scale
 * the antialias band.
 *
 * Metrics are in font units; convert to pixels via
 * `value * fontSize / unitsPerEm`. `bbox*` is the tight glyph
 * bounding box (origin lower-left, y-up — standard font convention).
 * `advance` is the horizontal cursor step.
 */
export interface AtlasGlyph {
  readonly codePoint: number;
  readonly atlasX: number;
  readonly atlasY: number;
  readonly tileSize: number;
  readonly range: number;
  readonly advance: number;
  readonly bboxXMin: number;
  readonly bboxYMin: number;
  readonly bboxW: number;
  readonly bboxH: number;
  readonly unitsPerEm: number;
  /**
   * `true` when the glyph has no contours (whitespace, control chars,
   * missing-cmap entries). The shader should skip the textured quad
   * entirely; the host still uses `advance` to step the layout
   * cursor.
   */
  readonly empty: boolean;
}

export interface GlyphAtlasOptions {
  /** Edge length of the backing texture. Default {@link DEFAULT_ATLAS_SIZE}. */
  readonly atlasSize?: number;
  /** Per-glyph tile edge. Default {@link DEFAULT_TILE_SIZE}. */
  readonly tileSize?: number;
  /** SDF range in atlas pixels. Default {@link DEFAULT_RANGE}. */
  readonly range?: number;
}

/**
 * Pre-rasterised glyph cache backed by a single fixed-size RGB
 * texture. Glyphs are baked on first request through the supplied
 * MSDF shaper and packed into a uniform grid — every tile is the
 * same `tileSize × tileSize`, so placement is O(1) (no shelf
 * packing required).
 *
 * Uniform grid rather than shelf packing because:
 *   • Lookup is integer division, no per-glyph dimension hash.
 *   • Atlas churn is predictable — never fragments.
 *   • The MSDF pipeline gives every glyph the same tile size by
 *     construction (scale-to-fit), so heterogeneous packing wouldn't
 *     save anything.
 *
 * No eviction: when the atlas is full it returns null on overflow.
 *
 * GPU coupling lives in {@link GlyphAtlas.uploadTo} so this module
 * doesn't have to depend on a WebGL surface; the host calls it with
 * its `WebGL2RenderingContext` and gets back the live texture.
 */
export class GlyphAtlas {
  private readonly shaper: MsdfShaper;
  readonly atlasSize: number;
  readonly tileSize: number;
  readonly range: number;
  readonly columns: number;
  readonly capacity: number;

  /** Per-glyph cache. Key = `fontId * 0x110000 + codePoint` (see `glyphKey`). */
  private readonly glyphs = new Map<number, AtlasGlyph>();
  /** CPU-side RGB buffer mirroring the GPU texture. */
  private readonly buffer: Uint8Array;
  /** Tile indices baked since the last upload (newly added). */
  private readonly dirtyTiles = new Set<number>();
  /** True while `buffer` has never been pushed to the GPU. */
  private needsFullUpload = true;
  /** Next free tile slot in row-major order. */
  private nextSlot = 0;
  /** GPU texture; created lazily by `uploadTo`, kept across frames. */
  private texture: WebGLTexture | null = null;

  constructor(shaper: MsdfShaper, options: GlyphAtlasOptions = {}) {
    this.shaper = shaper;
    this.atlasSize = options.atlasSize ?? DEFAULT_ATLAS_SIZE;
    this.tileSize = options.tileSize ?? DEFAULT_TILE_SIZE;
    this.range = options.range ?? DEFAULT_RANGE;
    if (this.atlasSize % this.tileSize !== 0) {
      throw new Error(
        `GlyphAtlas: atlasSize (${this.atlasSize}) must be a multiple of tileSize (${this.tileSize})`,
      );
    }
    this.columns = this.atlasSize / this.tileSize;
    this.capacity = this.columns * this.columns;
    this.buffer = new Uint8Array(this.atlasSize * this.atlasSize * 3);
  }

  /** Resolve a CSS font-family (+ bold/italic) to the shaper's font id (0 when single-font). */
  resolveFontId(family: string, bold = false, italic = false): number {
    return this.shaper.resolveFontId?.(family, bold, italic) ?? 0;
  }

  /**
   * Resolve a glyph slot, baking it on first request. Returns `null`
   * only if the atlas is full (`capacity` slots used) and the
   * requested code point isn't already cached.
   *
   * Empty / whitespace glyphs are cached too — their tile stays at
   * zero so the GPU sample reads as "fully outside". The slot stays
   * allocated so the metrics are still discoverable.
   */
  getOrRasterize(codePoint: number, fontId = 0): AtlasGlyph | null {
    // Glyphs from different fonts share one atlas texture but must not
    // collide in the cache — key by (fontId, codePoint). codePoint is
    // ≤ 0x10FFFF, so the multiply leaves no overlap.
    const key = fontId * 0x110000 + codePoint;
    const cached = this.glyphs.get(key);
    if (cached) return cached;
    if (this.nextSlot >= this.capacity) return null;

    const metrics = this.shaper.glyphMetrics(codePoint, fontId);
    if (!metrics) return null; // shaper without MSDF support — caller should fall back

    const slot = this.nextSlot++;
    const col = slot % this.columns;
    const row = Math.floor(slot / this.columns);
    const atlasX = col * this.tileSize;
    const atlasY = row * this.tileSize;

    const isEmpty = metrics.bboxW <= 0 || metrics.bboxH <= 0;
    if (!isEmpty) {
      const tile = this.shaper.rasterizeGlyphMSDF(codePoint, this.tileSize, this.range, fontId);
      if (tile) {
        // Blit the per-tile MSDF into the right region of the
        // atlas-wide buffer (texel-rows are non-contiguous in the
        // big buffer, so copy row by row).
        for (let y = 0; y < this.tileSize; y++) {
          const srcOffset = y * this.tileSize * 3;
          const dstOffset = ((atlasY + y) * this.atlasSize + atlasX) * 3;
          this.buffer.set(tile.data.subarray(srcOffset, srcOffset + this.tileSize * 3), dstOffset);
        }
        this.dirtyTiles.add(slot);
      }
    }

    const entry: AtlasGlyph = {
      codePoint,
      atlasX,
      atlasY,
      tileSize: this.tileSize,
      range: this.range,
      advance: metrics.advance,
      bboxXMin: metrics.bboxXMin,
      bboxYMin: metrics.bboxYMin,
      bboxW: metrics.bboxW,
      bboxH: metrics.bboxH,
      unitsPerEm: metrics.unitsPerEm,
      empty: isEmpty,
    };
    this.glyphs.set(key, entry);
    return entry;
  }

  /** Number of glyphs currently cached. */
  get glyphCount(): number {
    return this.glyphs.size;
  }

  /**
   * Read-only access to the CPU-side mirror of the atlas texture.
   * Tests assert that a glyph landed where expected; the GPU upload
   * uses it as the texImage2D source.
   */
  get cpuBuffer(): Uint8Array {
    return this.buffer;
  }

  /**
   * Upload any dirty regions to a WebGL2 texture, creating the
   * texture on first call. The texture is reused across calls; the
   * GPU only sees the bytes that changed since the last upload
   * (incremental `texSubImage2D` per dirty tile), so steady-state
   * cost is near-zero for hosts that touch a stable glyph set.
   *
   * The returned texture is owned by the atlas; callers must NOT
   * delete it. Call {@link GlyphAtlas.dispose} when the atlas (or
   * the owning surface) goes away.
   */
  uploadTo(gl: WebGL2RenderingContext): WebGLTexture {
    if (!this.texture) {
      const tex = gl.createTexture();
      // lib.dom types createTexture() as non-null, but WebGL really does
      // return null on context loss / OOM — keep the runtime guard.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!tex) throw new Error("GlyphAtlas: gl.createTexture() returned null");
      this.texture = tex;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
    }

    if (this.needsFullUpload) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGB8,
        this.atlasSize,
        this.atlasSize,
        0,
        gl.RGB,
        gl.UNSIGNED_BYTE,
        this.buffer,
      );
      this.needsFullUpload = false;
      this.dirtyTiles.clear();
      return this.texture;
    }

    if (this.dirtyTiles.size === 0) return this.texture;

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // `UNPACK_ROW_LENGTH` pushes a sub-rectangle out of the big atlas
    // buffer without copying it into a contiguous slab first.
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, this.atlasSize);
    for (const slot of this.dirtyTiles) {
      const col = slot % this.columns;
      const row = Math.floor(slot / this.columns);
      const atlasX = col * this.tileSize;
      const atlasY = row * this.tileSize;
      const skipPixels = atlasX;
      const skipRows = atlasY;
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, skipPixels);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, skipRows);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        atlasX,
        atlasY,
        this.tileSize,
        this.tileSize,
        gl.RGB,
        gl.UNSIGNED_BYTE,
        this.buffer,
      );
    }
    // Reset the pixel-store state we touched so unrelated uploads
    // (e.g. images) further down the pipeline see the defaults.
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    this.dirtyTiles.clear();
    return this.texture;
  }

  /**
   * Release the GPU texture. The CPU mirror stays around — the
   * atlas can be re-uploaded into a fresh context without re-baking
   * any glyphs.
   */
  dispose(gl?: WebGL2RenderingContext): void {
    if (this.texture && gl) {
      gl.deleteTexture(this.texture);
    }
    this.texture = null;
    this.needsFullUpload = true;
  }
}
