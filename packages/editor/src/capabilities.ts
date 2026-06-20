import {
  isWebGL2Available,
  isWebGPUAvailable,
  type RendererBackend,
} from "@oh-just-another/renderer-canvas";

/**
 * Capability profile chosen for a `<Diagram>` mount. Calculated once
 * via {@link detectCapabilities}; flows downstream into the renderer
 * backend, WASM opt-ins, worker pool, tile cache, etc. The result is
 * also logged to the console at boot so the host can see exactly
 * what's been activated.
 *
 * Hosts may override individual fields via `<Diagram capabilities={…}>`
 * — passing a partial profile shallow-merges over the auto-detect
 * result, so e.g. `{ wasmText: false }` forces Canvas2D measureText
 * even on a browser that would happily run the bundled WASM.
 */
export interface CapabilityProfile {
  /**
   * Renderer backend the kernel will activate. `auto` is never the
   * final value — detection collapses it to one of the concrete
   * choices before mount.
   */
  readonly renderer: RendererBackend;
  /** Use the bundled `WasmTextShaper` for wrap measurements. */
  readonly wasmText: boolean;
  /**
   * Use the bundled `WasmRasterizer` for path flatten / stroke-to-
   * fill. Currently only the WebGL2 backend calls into the
   * rasterizer (Canvas2D has native `ctx.bezierCurveTo` which is
   * faster than any WASM round-trip); detection still flips this
   * field on for any backend so the host knows the wasm is loaded.
   */
  readonly wasmRaster: boolean;
  /**
   * Spawn OffscreenCanvas workers per layer for the main render
   * pass. Independent from `renderer === "offscreen"` — even with
   * a Canvas2D main path the tile pre-rasterisation can be off-
   * thread. Set false on Safari < 16.4 (no OffscreenCanvas).
   */
  readonly workers: boolean;
  /**
   * Use the tile cache compositor for very large scenes. Only kicks
   * in when scene size crosses `LARGE_SCENE_HIT_THRESHOLD` —
   * smaller scenes pay no overhead from this flag.
   */
  readonly tiles: boolean;
  /**
   * Whether `pointer: coarse` was reported (touch primary input).
   * Editor uses this for hit-slop tuning; surfaced here so the
   * console log shows the chosen modality.
   */
  readonly touch: boolean;
}

/**
 * What the host can pass to `<Diagram capabilities={…}>`. Each
 * field becomes `auto` when omitted, meaning "let the detector
 * pick"; anything else short-circuits detection for that field.
 */
export interface CapabilityOverrides {
  readonly renderer?: RendererBackend | "auto";
  readonly wasmText?: boolean | "auto";
  readonly wasmRaster?: boolean | "auto";
  readonly workers?: boolean | "auto";
  readonly tiles?: boolean | "auto";
}

const supportsOffscreenCanvas = (): boolean => {
  if (typeof OffscreenCanvas === "undefined") return false;
  if (typeof HTMLCanvasElement === "undefined") return false;
  return typeof HTMLCanvasElement.prototype.transferControlToOffscreen === "function";
};

const supportsWorkers = (): boolean => typeof Worker !== "undefined";

const supportsWasm = (): boolean =>
  typeof WebAssembly !== "undefined" && typeof WebAssembly.instantiate === "function";

const isTouchPrimary = (): boolean => {
  if (typeof matchMedia !== "function") return false;
  try {
    return matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
};

/**
 * Pick the best renderer the runtime actually supports. WebGPU is
 * surrogated to WebGL2 today (no GPU pipeline shipped) — the
 * detector returns `webgl2` when WebGPU is present so the host
 * still gets the highest-fidelity available path.
 */
const detectRenderer = async (): Promise<RendererBackend> => {
  if (await isWebGPUAvailable()) return "webgl2";
  if (isWebGL2Available()) return "webgl2";
  if (supportsOffscreenCanvas() && supportsWorkers()) return "offscreen";
  return "canvas2d";
};

/**
 * Run the auto-detection sweep and apply caller overrides. Always
 * async because WebGPU detection requires `await requestAdapter()`.
 *
 * Override semantics:
 *   • absent / `"auto"` → detector picks
 *   • concrete value (renderer string, true, false) → wins outright
 */
export const detectCapabilities = async (
  overrides: CapabilityOverrides = {},
): Promise<CapabilityProfile> => {
  const renderer =
    overrides.renderer && overrides.renderer !== "auto"
      ? overrides.renderer
      : await detectRenderer();
  const wasmText =
    overrides.wasmText !== undefined && overrides.wasmText !== "auto"
      ? overrides.wasmText
      : supportsWasm();
  const wasmRaster =
    overrides.wasmRaster !== undefined && overrides.wasmRaster !== "auto"
      ? overrides.wasmRaster
      : supportsWasm() && renderer === "webgl2";
  const workers =
    overrides.workers !== undefined && overrides.workers !== "auto"
      ? overrides.workers
      : supportsOffscreenCanvas() && supportsWorkers();
  const tiles =
    overrides.tiles !== undefined && overrides.tiles !== "auto" ? overrides.tiles : true;
  return { renderer, wasmText, wasmRaster, workers, tiles, touch: isTouchPrimary() };
};

/**
 * One-line console.log of the unpacked profile — a fixed format so the
 * host can grep it in DevTools. Runs once on mount; repeated calls
 * print a new line.
 */
export const logCapabilities = (profile: CapabilityProfile): void => {
  const reason =
    profile.renderer === "webgl2"
      ? "WebGL2"
      : profile.renderer === "offscreen"
        ? "OffscreenCanvas + Worker"
        : "Canvas2D";
  // eslint-disable-next-line no-console
  console.log(
    "%c[diagram]%c renderer=%s, wasmText=%s, wasmRaster=%s, workers=%s, tiles=%s, touch=%s (%s)",
    "color: #1a73e8; font-weight: 700",
    "color: inherit",
    profile.renderer,
    profile.wasmText,
    profile.wasmRaster,
    profile.workers,
    profile.tiles,
    profile.touch,
    reason,
  );
};
