/**
 * Glyph-baking worker. WASM MSDF generation costs 15–50 ms PER GLYPH —
 * far over a frame budget — so the WebGL2 backend ships bake requests
 * here and the main thread never runs the rasteriser at all. The worker
 * owns its own `WasmTextShaper` instance (same bundled module → same
 * font ids and metrics as the main thread's shaper).
 *
 * Protocol: `{ codePoint, fontId, tileSize, range }` in,
 * `{ codePoint, fontId, metrics | null, tile | null }` out (tile buffer
 * transferred, not copied).
 */
import { WasmTextShaper } from "@oh-just-another/text-wasm";

export interface GlyphBakeRequest {
  readonly codePoint: number;
  readonly fontId: number;
  readonly tileSize: number;
  readonly range: number;
}

export interface GlyphBakeResponse {
  readonly codePoint: number;
  readonly fontId: number;
  readonly metrics: {
    readonly advance: number;
    readonly bboxXMin: number;
    readonly bboxYMin: number;
    readonly bboxW: number;
    readonly bboxH: number;
    readonly unitsPerEm: number;
  } | null;
  readonly tile: Uint8Array | null;
}

const shaperPromise = WasmTextShaper.loadBundled();

self.onmessage = (ev: MessageEvent<GlyphBakeRequest>) => {
  const { codePoint, fontId, tileSize, range } = ev.data;
  void shaperPromise.then((shaper) => {
    const metrics = shaper.glyphMetrics(codePoint, fontId);
    if (!metrics) {
      (self as unknown as Worker).postMessage({
        codePoint,
        fontId,
        metrics: null,
        tile: null,
      } satisfies GlyphBakeResponse);
      return;
    }
    let tile: Uint8Array | null = null;
    if (metrics.bboxW > 0 && metrics.bboxH > 0) {
      const raster = shaper.rasterizeGlyphMSDF(codePoint, tileSize, range, fontId);
      // Copy out of WASM linear memory — the view dies on the next call.
      if (raster) tile = raster.data.slice();
    }
    const response: GlyphBakeResponse = { codePoint, fontId, metrics, tile };
    if (tile) {
      (self as unknown as Worker).postMessage(response, [tile.buffer]);
    } else {
      (self as unknown as Worker).postMessage(response);
    }
  });
};
