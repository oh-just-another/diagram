import type { ShapedGlyph, ShaperFont, TextShaper } from "@oh-just-another/renderer-core";
import { FALLBACK_ADVANCE_FACTOR, MEASURE_CACHE_SIZE } from "./constants.js";

/**
 * WASM-backed text shaper.
 *
 * The kernel ships an interface in `@oh-just-another/renderer-core` so
 * hosts can swap measurement engines. This package provides the
 * default WASM-aware implementation:
 *
 *   • Until a WASM module is loaded via `loadModule`, calls fall
 *     back to a synchronous geometric estimate (proportional
 *     monospace-style advance). Layout stays roughly correct so
 *     the first paint isn't blank.
 *   • `loadModule(bytes | url, exports)` plugs a real shaper in.
 *     The expected `exports` shape is documented inline — any
 *     HarfBuzz / harfbuzzjs / ICU4X build that exposes a
 *     `measure(textPtr, len, fontPtr) → width` function and
 *     conventional `memory` + `alloc`/`free` can be wired up.
 *   • Cache: small LRU keyed on the (text, font) pair so repeated
 *     measurements (re-renders of the same labels) are O(1).
 *
 * The JS fallback in `shape()` only fills `advance` for each
 * character so decoration positioning lines up roughly even before
 * the WASM module loads.
 */

export interface WasmShaperExports {
  readonly memory: WebAssembly.Memory;
  readonly alloc: (bytes: number) => number;
  readonly free: (ptr: number, bytes: number) => void;
  readonly setFont: (
    familyPtr: number,
    familyLen: number,
    size: number,
    bold: number,
    italic: number,
  ) => void;
  readonly measure: (textPtr: number, textLen: number) => number;
  /**
   * Optional — resolve a UTF-8 CSS font-family + bold/italic flags to a
   * font id `familyBase + (bold?1:0) + (italic?2:0)` where familyBase is
   * 0/4/8 (sans/serif/mono). Present in multi-font modules. Single-font
   * modules omit it (host treats everything as id 0).
   */
  readonly resolveFont?: (
    familyPtr: number,
    familyLen: number,
    bold: number,
    italic: number,
  ) => number;
  /**
   * Optional — only present when the bundled MSDF-capable module is
   * loaded. Returns a pointer to 24 bytes (6 × f32 little-endian) with
   * the layout `[advance, bboxXMin, bboxYMin, bboxW, bboxH, unitsPerEm]`
   * in font units. Pointer stays valid until the next `reset()`.
   * `fontId` selects the embedded font.
   */
  readonly glyphMetrics?: (fontId: number, codePoint: number) => number;
  /**
   * Optional — only present when the bundled MSDF-capable module is
   * loaded. Returns a pointer to `atlasSize * atlasSize * 3` RGB
   * bytes containing the multi-channel signed distance field for the
   * supplied code point. `range` is the SDF range in atlas pixels
   * (the host's shader uses `median(r,g,b)` + `smoothstep` to
   * antialias). Empty / missing glyphs return an all-zero buffer.
   * `fontId` selects the embedded font.
   */
  readonly rasterizeGlyphMSDF?: (
    fontId: number,
    codePoint: number,
    atlasSize: number,
    range: number,
  ) => number;
  readonly reset?: () => void;
}

/**
 * Per-glyph metrics in font units. The host converts to pixels via
 * `value * fontSize / unitsPerEm`. `bbox` is the glyph's tight
 * bounding box (in font coords — y-up, origin at left of baseline);
 * `advance` is the horizontal advance (how far the cursor moves to
 * place the next glyph). All values are zero for missing glyphs.
 */
export interface GlyphMetrics {
  readonly advance: number;
  readonly bboxXMin: number;
  readonly bboxYMin: number;
  readonly bboxW: number;
  readonly bboxH: number;
  readonly unitsPerEm: number;
}

/**
 * Raw MSDF tile for a single glyph. `data` is `atlasSize *
 * atlasSize * 3` bytes in RGB order. `data` is a view into the WASM
 * linear memory and must be copied before the next WASM call (which
 * may grow / re-alloc the arena).
 */
export interface MsdfGlyphTile {
  readonly atlasSize: number;
  readonly range: number;
  readonly data: Uint8Array;
}

export interface WasmTextShaperOptions {
  /** Override the LRU cap. Defaults to `MEASURE_CACHE_SIZE`. */
  readonly cacheSize?: number;
  /** Override the fallback advance factor. */
  readonly fallbackAdvanceFactor?: number;
}

export class WasmTextShaper implements TextShaper {
  private readonly cacheSize: number;
  private readonly fallbackFactor: number;
  private readonly cache = new Map<string, { width: number }>();
  private wasm: WasmShaperExports | null = null;
  private currentFontKey: string | null = null;
  private readonly textEncoder = new TextEncoder();

  constructor(options: WasmTextShaperOptions = {}) {
    this.cacheSize = options.cacheSize ?? MEASURE_CACHE_SIZE;
    this.fallbackFactor = options.fallbackAdvanceFactor ?? FALLBACK_ADVANCE_FACTOR;
  }

  /** Returns `true` once a WASM module has been successfully loaded. */
  get isReady(): boolean {
    return this.wasm !== null;
  }

  /**
   * Load a WASM module that exposes the `WasmShaperExports` interface.
   * Accepts either a fetched URL (resolves a Response) or a raw
   * ArrayBuffer / TypedArray of the module bytes.
   *
   * Resets the cache — fallback measurements are usually very
   * different from the real ones, so reusing them would produce a
   * layout pop on the next paint.
   */
  async loadModule(source: string | URL | ArrayBuffer | Uint8Array | Response): Promise<void> {
    const bytes = await fetchModuleBytes(source);
    const { instance } = await WebAssembly.instantiate(bytes, {});
    this.wasm = instance.exports as unknown as WasmShaperExports;
    this.cache.clear();
    this.currentFontKey = null;
  }

  /**
   * Load the bundled `text_shaper.wasm` shipped with this package.
   * Equivalent to
   *
   *   shaper.loadModule(new URL("../wasm/text_shaper.wasm",
   *                              import.meta.url))
   *
   * In a Vite-built host the URL resolves to a hashed bundle asset;
   * in Node, `fetch` (Node 18+) reads it from disk through the
   * `file://` URL. SSR-only hosts can pass the bytes directly to
   * `loadModule(...)` to skip the fetch hop.
   */
  static async loadBundled(): Promise<WasmTextShaper> {
    const shaper = new WasmTextShaper();
    const url = new URL("../wasm/text_shaper.wasm", import.meta.url);
    await shaper.loadModule(url);
    return shaper;
  }

  measure(text: string, font: ShaperFont): { width: number } {
    const cacheKey = `${fontKey(font)}|${text}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      // Promote — Map preserves insertion order, so re-set on hit.
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached;
    }
    const result = this.wasm
      ? this.measureViaWasm(text, font, this.wasm)
      : this.measureFallback(text, font);
    if (this.cache.size >= this.cacheSize) {
      // Evict oldest entry (insertion order is LRU order).
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(cacheKey, result);
    return result;
  }

  shape(text: string, font: ShaperFont): readonly ShapedGlyph[] {
    // No WASM glyph-id mapping — emit one synthetic glyph per code
    // point so callers that decorate (underline, strikeout) have
    // positions to work with.
    const total = this.measure(text, font);
    const perChar = text.length === 0 ? 0 : total.width / text.length;
    const out: ShapedGlyph[] = [];
    for (let i = 0; i < text.length; i++) {
      out.push({
        glyphId: text.charCodeAt(i),
        advance: perChar,
        x: i * perChar,
        y: 0,
      });
    }
    return out;
  }

  /**
   * Resolve a CSS font-family stack to an embedded font id (0=sans,
   * 1=serif, 2=mono). Returns 0 when the module is single-font (no
   * `resolveFont` export) or not yet loaded, so callers degrade to the
   * default font transparently. The atlas keys glyphs by this id, so
   * the same code point in two families gets two tiles.
   */
  resolveFontId(family: string, bold = false, italic = false): number {
    const wasm = this.wasm;
    if (!wasm?.resolveFont) return 0;
    const bytes = this.textEncoder.encode(family);
    const ptr = wasm.alloc(bytes.byteLength);
    new Uint8Array(wasm.memory.buffer, ptr, bytes.byteLength).set(bytes);
    const id = wasm.resolveFont(ptr, bytes.byteLength, bold ? 1 : 0, italic ? 1 : 0);
    wasm.free(ptr, bytes.byteLength);
    return id;
  }

  /**
   * Pull per-glyph metrics (advance + tight bbox + UPM) from the WASM
   * shaper for a single code point. Returns `null` if the loaded
   * module doesn't expose `glyphMetrics` or before `loadModule()` has
   * resolved. All values are in font units; the host scales via
   * `fontSize / unitsPerEm` — same convention as `measure` uses
   * internally. `fontId` selects the embedded font.
   *
   * The returned object is detached (plain object, not a memory
   * view), so callers can keep it past further WASM calls.
   */
  glyphMetrics(codePoint: number, fontId = 0): GlyphMetrics | null {
    const wasm = this.wasm;
    if (!wasm?.glyphMetrics) return null;
    const ptr = wasm.glyphMetrics(fontId, codePoint);
    const buffer = wasm.memory.buffer;
    // 6 contiguous little-endian f32 (24 bytes). Read via DataView, not
    // `new Float32Array(buffer, ptr, 6)`: the WASM ABI does not
    // guarantee `ptr` is 4-byte aligned, and a typed-array view throws
    // `RangeError: start offset … should be a multiple of 4` on an
    // unaligned pointer. DataView has no alignment constraint. Guard the
    // bounds so a stray pointer returns null instead of throwing.
    if (ptr <= 0 || ptr + 24 > buffer.byteLength) return null;
    const dv = new DataView(buffer, ptr, 24);
    return {
      advance: dv.getFloat32(0, true),
      bboxXMin: dv.getFloat32(4, true),
      bboxYMin: dv.getFloat32(8, true),
      bboxW: dv.getFloat32(12, true),
      bboxH: dv.getFloat32(16, true),
      unitsPerEm: dv.getFloat32(20, true),
    };
  }

  /**
   * Rasterise a single glyph as an MSDF tile. The bundled wasm uses
   * the `fdsm` crate (pure-Rust msdfgen-style implementation) — three
   * channels, 3°-equivalent corner detection, sign-correction
   * post-pass. `atlasSize` is the tile edge in pixels (typical 32 /
   * 48 / 64); `range` is the SDF range in atlas pixels (typically
   * `atlasSize / 8`, so the shader has ~`range`px to soften the edge
   * with `smoothstep`).
   *
   * Returns `null` when the loaded module doesn't expose
   * `rasterizeGlyphMSDF`. Returns a buffer of zeros for missing or
   * empty (whitespace) glyphs — the host shader reads zero as "fully
   * outside" which is the correct visual outcome.
   *
   * The returned `data` is a **copy** of the WASM-side buffer so the
   * tile survives subsequent WASM calls that may grow the arena.
   */
  rasterizeGlyphMSDF(
    codePoint: number,
    atlasSize: number,
    range: number,
    fontId = 0,
  ): MsdfGlyphTile | null {
    const wasm = this.wasm;
    if (!wasm?.rasterizeGlyphMSDF) return null;
    const ptr = wasm.rasterizeGlyphMSDF(fontId, codePoint, atlasSize, range);
    const len = atlasSize * atlasSize * 3;
    // Copy out of WASM memory into a standalone Uint8Array. `slice()`
    // allocates fresh storage so the caller is safe even after
    // subsequent allocs grow / move the WASM arena.
    const view = new Uint8Array(wasm.memory.buffer, ptr, len);
    const data = new Uint8Array(view); // copy
    return { atlasSize, range, data };
  }

  /**
   * Reset the WASM bump arena to zero — frees all transient
   * allocations (font-family copies, measure inputs, MSDF tiles).
   * Safe to call between batches; no-op if the loaded module doesn't
   * expose `reset`. Hosts that hammer the atlas (large strings,
   * many glyphs) should call this after each frame to avoid
   * unbounded arena growth.
   */
  resetArena(): void {
    this.wasm?.reset?.();
    this.currentFontKey = null;
  }

  private measureFallback(text: string, font: ShaperFont): { width: number } {
    return { width: text.length * font.size * this.fallbackFactor };
  }

  private measureViaWasm(
    text: string,
    font: ShaperFont,
    wasm: WasmShaperExports,
  ): { width: number } {
    // Update the WASM-side font only when it changes — the setFont
    // call is the expensive one (the host engine has to re-resolve
    // the font on every flip).
    const fkey = fontKey(font);
    if (fkey !== this.currentFontKey) {
      const familyBytes = this.textEncoder.encode(font.family);
      const familyPtr = wasm.alloc(familyBytes.byteLength);
      const familyView = new Uint8Array(wasm.memory.buffer, familyPtr, familyBytes.byteLength);
      familyView.set(familyBytes);
      // The `measure()` path has no weight/style channel (ShaperFont is
      // family+size only) — measure the regular face. The bold/italic
      // glyph advances reach callers via the atlas path (`glyphMetrics`
      // with an explicit fontId), which is what the WebGL2 backend uses.
      wasm.setFont(familyPtr, familyBytes.byteLength, font.size, 0, 0);
      wasm.free(familyPtr, familyBytes.byteLength);
      this.currentFontKey = fkey;
    }

    const textBytes = this.textEncoder.encode(text);
    const textPtr = wasm.alloc(textBytes.byteLength);
    const textView = new Uint8Array(wasm.memory.buffer, textPtr, textBytes.byteLength);
    textView.set(textBytes);
    const width = wasm.measure(textPtr, textBytes.byteLength);
    wasm.free(textPtr, textBytes.byteLength);
    return { width };
  }
}

const fontKey = (font: ShaperFont): string =>
  `${font.family}|${font.size}|${font.weight ?? "normal"}|${font.style ?? "normal"}`;

const fetchModuleBytes = async (
  source: string | URL | ArrayBuffer | Uint8Array | Response,
): Promise<ArrayBuffer> => {
  if (source instanceof ArrayBuffer) return source;
  if (source instanceof Uint8Array) {
    return source.buffer.slice(
      source.byteOffset,
      source.byteOffset + source.byteLength,
    ) as ArrayBuffer;
  }
  if (source instanceof Response) return source.arrayBuffer();
  // Node's WHATWG fetch refuses `file://` URLs (not implemented as
  // of Node 22). Detect the protocol and read straight from disk
  // so `loadBundled()` works in tests / SSR / CLI contexts.
  const urlStr = typeof source === "string" ? source : source.href;
  if (urlStr.startsWith("file:")) {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const path = fileURLToPath(urlStr);
    const buf = await readFile(path);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const res = await fetch(source);
  if (!res.ok) {
    throw new Error(`WasmTextShaper.loadModule: fetch failed (${res.status})`);
  }
  return res.arrayBuffer();
};
