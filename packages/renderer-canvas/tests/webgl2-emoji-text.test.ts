/**
 * Regression: emoji strings must never take the MSDF path (the atlas has
 * no colour glyphs and its glyph-run measure is NaN — `new
 * OffscreenCanvas(NaN, …)` then threw on every frame, killing the render
 * loop). Pictograph strings measure via Canvas2D and rasterise safely.
 */
import { afterEach, describe, expect, it } from "vitest";
import { WebGL2Target } from "../src/webgl2/webgl2-target";

const makeStubGl = () => {
  const base: Record<string, unknown> = {
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => null,
    getProgramInfoLog: () => null,
    getExtension: () => null,
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return () => 1;
    },
  });
};

const makeTarget = (): WebGL2Target => {
  const gl = makeStubGl();
  const canvas = {
    width: 100,
    height: 100,
    getContext: () => gl,
  } as unknown as HTMLCanvasElement;
  return new WebGL2Target(canvas, 100, 100);
};

afterEach(() => {
  // jsdom has no OffscreenCanvas — tests that stub it clean up here.
  delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
});

describe("webgl2 emoji text", () => {
  it("measureText returns a finite width for pictograph strings", () => {
    const target = makeTarget();
    target.setFont("system-ui, sans-serif", 48, {});
    const m = target.measureText("😀");
    expect(Number.isFinite(m.width)).toBe(true);
  });

  it("fillText with an emoji never constructs a canvas from NaN dimensions", () => {
    const ctorArgs: unknown[][] = [];
    class FakeOffscreen {
      constructor(...args: unknown[]) {
        ctorArgs.push(args);
        for (const a of args) {
          if (typeof a !== "number" || !Number.isFinite(a)) {
            throw new TypeError("Value is not of type 'unsigned long'.");
          }
        }
      }
      getContext(): null {
        return null; // bitmap path bails gracefully without a 2D context
      }
    }
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = FakeOffscreen;
    const target = makeTarget();
    target.setFont("system-ui, sans-serif", 48, {});
    expect(() => {
      target.fillText("😀", 0, 0);
    }).not.toThrow();
    for (const args of ctorArgs) {
      for (const a of args) expect(Number.isFinite(a as number)).toBe(true);
    }
  });
});
