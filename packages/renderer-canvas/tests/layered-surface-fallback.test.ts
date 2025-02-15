import { describe, expect, it, vi } from "vitest";
import { createLayeredSurfaceWithFallback } from "../src/layered-surface";

/**
 * Tests the graceful-degrade contract without a real DOM: we stub
 * just enough of `HTMLElement` to let the surface constructors
 * run, and rely on canvas2d's `getContext("2d")` returning null
 * under the stub to short-circuit straight to fallback.
 *
 * Real-browser behaviour is verified in the e2e demo: switching
 * to a backend the host doesn't support logs a warning and the
 * canvas stays alive on canvas2d.
 */

const make2DStub = () => ({
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
});

const makeCanvasStub = (overrides: Partial<HTMLCanvasElement> = {}): HTMLCanvasElement => {
  const state = { w: 0, h: 0 };
  return {
    width: state.w,
    height: state.h,
    style: { width: "", height: "" },
    dataset: {},
    // 2D works; webgl2 fails (returns null) so the WebGL2 surface
    // throws and the fallback path is exercised end-to-end.
    getContext: vi.fn((kind: string) => (kind === "2d" ? make2DStub() : null)),
    appendChild: vi.fn(),
    remove: vi.fn(),
    transferControlToOffscreen: vi.fn(() => ({}) as unknown as OffscreenCanvas),
    ...overrides,
  } as unknown as HTMLCanvasElement;
};

const makeHostStub = (canvasFactory?: () => HTMLCanvasElement): HTMLElement => {
  const factory = canvasFactory ?? (() => makeCanvasStub());
  return {
    ownerDocument: {
      createElement: vi.fn(() => factory()),
    },
    appendChild: vi.fn(),
    style: { position: "" },
  } as unknown as HTMLElement;
};

// `getComputedStyle` is consulted in the constructors; provide a
// minimal global stub so the call doesn't blow up.
beforeAll();

function beforeAll(): void {
  const g = globalThis as unknown as {
    getComputedStyle?: unknown;
    window?: unknown;
  };
  if (typeof g.getComputedStyle !== "function") {
    g.getComputedStyle = () => ({ position: "relative" });
  }
  if (typeof g.window === "undefined") {
    g.window = { devicePixelRatio: 1 };
  }
}

describe("createLayeredSurfaceWithFallback", () => {
  it("falls back to canvas2d when webgl2 init throws", () => {
    const host = makeHostStub();
    const onFallback = vi.fn();
    const { effectiveBackend } = createLayeredSurfaceWithFallback(
      host,
      100,
      100,
      { backend: "webgl2" },
      onFallback,
    );
    expect(effectiveBackend).toBe("canvas2d");
    expect(onFallback).toHaveBeenCalledOnce();
    expect(onFallback.mock.calls[0]![0]).toBe("webgl2");
  });

  it("falls back to canvas2d when offscreen workerFactory is missing", () => {
    const host = makeHostStub();
    const onFallback = vi.fn();
    const { effectiveBackend } = createLayeredSurfaceWithFallback(
      host,
      100,
      100,
      { backend: "offscreen" },
      onFallback,
    );
    expect(effectiveBackend).toBe("canvas2d");
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it("re-throws if canvas2d itself fails (no further fallback)", () => {
    const brokenHost = {
      ownerDocument: {
        createElement: () => {
          throw new Error("simulated DOM failure");
        },
      },
      appendChild: vi.fn(),
      style: { position: "" },
    } as unknown as HTMLElement;
    expect(() =>
      createLayeredSurfaceWithFallback(brokenHost, 100, 100, { backend: "canvas2d" }),
    ).toThrow(/simulated DOM failure/);
  });
});
