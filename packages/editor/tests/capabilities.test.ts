import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the renderer-canvas WebGL2 / WebGPU probes so we can drive every
// branch of `detectRenderer` deterministically.
vi.mock("@oh-just-another/renderer-canvas", () => ({
  isWebGL2Available: vi.fn(),
  isWebGPUAvailable: vi.fn(),
  supportsOffscreenCanvas: vi.fn(
    () =>
      typeof OffscreenCanvas !== "undefined" &&
      typeof HTMLCanvasElement !== "undefined" &&
      typeof HTMLCanvasElement.prototype.transferControlToOffscreen === "function",
  ),
}));

import { isWebGL2Available, isWebGPUAvailable } from "@oh-just-another/renderer-canvas";
import { detectCapabilities, logCapabilities } from "../src/capabilities";

const webgl2 = vi.mocked(isWebGL2Available);
const webgpu = vi.mocked(isWebGPUAvailable);

const realWasm = globalThis.WebAssembly;
const CANVAS_PROTO = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;

interface Env {
  webgl2?: boolean;
  webgpu?: boolean;
  /** `OffscreenCanvas` global is defined. */
  offscreen?: boolean;
  /** `transferControlToOffscreen` present on the canvas prototype. */
  transfer?: boolean;
  /** `Worker` global is defined. */
  worker?: boolean;
  /** `WebAssembly` global is present (defaults to the real one). */
  wasm?: boolean;
  pointer?: "coarse" | "fine" | "no-matchmedia" | "throws";
}

function setEnv(env: Env): void {
  webgl2.mockReturnValue(env.webgl2 ?? false);
  webgpu.mockResolvedValue(env.webgpu ?? false);

  vi.stubGlobal("OffscreenCanvas", env.offscreen ? vi.fn() : undefined);
  vi.stubGlobal("Worker", env.worker ? vi.fn() : undefined);
  vi.stubGlobal("WebAssembly", env.wasm === false ? undefined : realWasm);

  if (env.transfer) {
    CANVAS_PROTO.transferControlToOffscreen = (): undefined => undefined;
  } else {
    delete CANVAS_PROTO.transferControlToOffscreen;
  }

  if (env.pointer === "no-matchmedia") {
    vi.stubGlobal("matchMedia", undefined);
  } else if (env.pointer === "throws") {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("matchMedia unavailable");
    });
  } else {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: env.pointer === "coarse" && query.includes("coarse"),
    }));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete CANVAS_PROTO.transferControlToOffscreen;
  vi.clearAllMocks();
});

describe("detectCapabilities — renderer detection", () => {
  it("returns webgl2 when WebGPU is available (surrogated, WebGL2 probe skipped)", async () => {
    setEnv({ webgpu: true, webgl2: false });
    const profile = await detectCapabilities();
    expect(profile.renderer).toBe("webgl2");
    expect(webgl2).not.toHaveBeenCalled();
  });

  it("returns webgl2 when WebGL2 is available and WebGPU is not", async () => {
    setEnv({ webgpu: false, webgl2: true });
    expect((await detectCapabilities()).renderer).toBe("webgl2");
  });

  it("returns offscreen when only OffscreenCanvas + Worker are present", async () => {
    setEnv({ webgpu: false, webgl2: false, offscreen: true, transfer: true, worker: true });
    expect((await detectCapabilities()).renderer).toBe("offscreen");
  });

  it("falls back to canvas2d when nothing better is available", async () => {
    setEnv({ webgpu: false, webgl2: false });
    expect((await detectCapabilities()).renderer).toBe("canvas2d");
  });

  it("does not pick offscreen without a Worker", async () => {
    setEnv({ webgl2: false, offscreen: true, transfer: true, worker: false });
    expect((await detectCapabilities()).renderer).toBe("canvas2d");
  });

  it("does not pick offscreen without transferControlToOffscreen", async () => {
    setEnv({ webgl2: false, offscreen: true, transfer: false, worker: true });
    expect((await detectCapabilities()).renderer).toBe("canvas2d");
  });
});

describe("detectCapabilities — override semantics", () => {
  it("a concrete renderer override wins and short-circuits detection", async () => {
    setEnv({ webgpu: true, webgl2: true });
    const profile = await detectCapabilities({ renderer: "canvas2d" });
    expect(profile.renderer).toBe("canvas2d");
    expect(webgpu).not.toHaveBeenCalled();
    expect(webgl2).not.toHaveBeenCalled();
  });

  it('renderer "auto" runs detection', async () => {
    setEnv({ webgl2: true });
    const profile = await detectCapabilities({ renderer: "auto" });
    expect(profile.renderer).toBe("webgl2");
    expect(webgpu).toHaveBeenCalled();
  });

  it("wasmText=false forces off even when WASM is supported", async () => {
    setEnv({ wasm: true });
    expect((await detectCapabilities({ wasmText: false })).wasmText).toBe(false);
  });

  it("wasmText=true forces on even when WASM is absent", async () => {
    setEnv({ wasm: false });
    expect((await detectCapabilities({ wasmText: true })).wasmText).toBe(true);
  });

  it('wasmText "auto" follows WASM support', async () => {
    setEnv({ wasm: true });
    expect((await detectCapabilities({ wasmText: "auto" })).wasmText).toBe(true);
    setEnv({ wasm: false });
    expect((await detectCapabilities({ wasmText: "auto" })).wasmText).toBe(false);
  });

  it("workers=false forces off even when supported", async () => {
    setEnv({ offscreen: true, transfer: true, worker: true });
    expect((await detectCapabilities({ workers: false })).workers).toBe(false);
  });

  it("workers auto reflects OffscreenCanvas + Worker support", async () => {
    setEnv({ offscreen: true, transfer: true, worker: true });
    expect((await detectCapabilities()).workers).toBe(true);
    setEnv({ offscreen: true, transfer: true, worker: false });
    expect((await detectCapabilities()).workers).toBe(false);
  });

  it("tiles defaults to true and respects an override", async () => {
    setEnv({});
    expect((await detectCapabilities()).tiles).toBe(true);
    expect((await detectCapabilities({ tiles: false })).tiles).toBe(false);
  });
});

describe("detectCapabilities — wasmRaster rule", () => {
  it("auto: true only on webgl2 with WASM", async () => {
    setEnv({ webgl2: true, wasm: true });
    expect((await detectCapabilities()).wasmRaster).toBe(true);
  });

  it("auto: false on canvas2d even with WASM (native bezier is faster)", async () => {
    setEnv({ webgl2: false, wasm: true });
    expect((await detectCapabilities()).wasmRaster).toBe(false);
  });

  it("auto: false on webgl2 without WASM", async () => {
    setEnv({ webgl2: true, wasm: false });
    expect((await detectCapabilities()).wasmRaster).toBe(false);
  });

  it("a concrete override beats the rule (true on canvas2d)", async () => {
    setEnv({ webgl2: false, wasm: false });
    expect((await detectCapabilities({ wasmRaster: true })).wasmRaster).toBe(true);
  });
});

describe("detectCapabilities — touch detection", () => {
  it("reports touch when pointer is coarse", async () => {
    setEnv({ pointer: "coarse" });
    expect((await detectCapabilities()).touch).toBe(true);
  });

  it("reports no touch when pointer is fine", async () => {
    setEnv({ pointer: "fine" });
    expect((await detectCapabilities()).touch).toBe(false);
  });

  it("reports no touch when matchMedia is unavailable", async () => {
    setEnv({ pointer: "no-matchmedia" });
    expect((await detectCapabilities()).touch).toBe(false);
  });

  it("reports no touch when matchMedia throws", async () => {
    setEnv({ pointer: "throws" });
    expect((await detectCapabilities()).touch).toBe(false);
  });
});

describe("logCapabilities", () => {
  const baseProfile = {
    renderer: "canvas2d",
    wasmText: false,
    wasmRaster: false,
    workers: false,
    tiles: true,
    touch: false,
  } as const;

  it.each([
    ["webgl2", "WebGL2"],
    ["offscreen", "OffscreenCanvas + Worker"],
    ["canvas2d", "Canvas2D"],
  ])("logs %s with reason %s", (renderer, reason) => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logCapabilities({ ...baseProfile, renderer: renderer as typeof baseProfile.renderer });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.at(-1)).toBe(reason);
    spy.mockRestore();
  });
});
