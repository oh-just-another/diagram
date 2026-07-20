/**
 * Use-after-dispose guard: a late async frame (image decode / font load
 * resolving after a runtime backend switch) used to hit the lazy
 * `??=` pipeline rebuilds in `fill()` on the LOST context and throw
 * "Ellipse shader compile failed: null" from inside a promise chain.
 * After `dispose()` every draw entry point must be an inert no-op.
 */
import { describe, expect, it, vi } from "vitest";
import { WebGL2Target } from "../src/webgl2/webgl2-target";

// Stub GL whose context becomes "lost" once WEBGL_lose_context fires —
// from then on shader compiles fail with a null info log, exactly like
// a real browser after `loseContext()` / context-cap eviction.
const makeStubGl = () => {
  let lost = false;
  const base: Record<string, unknown> = {
    getShaderParameter: () => !lost,
    getProgramParameter: () => !lost,
    getShaderInfoLog: () => null,
    getProgramInfoLog: () => null,
    getExtension: (name: string) =>
      name === "WEBGL_lose_context"
        ? {
            loseContext: () => {
              lost = true;
            },
          }
        : null,
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

class FakeBitmap {
  readonly width = 4;
  readonly height = 4;
}
vi.stubGlobal("ImageBitmap", FakeBitmap);

describe("WebGL2Target after dispose", () => {
  it("ellipse fill is a no-op (no shader recompile on the lost context)", () => {
    const target = makeTarget();
    target.dispose();
    target.beginPath();
    target.ellipse(50, 50, 20, 10);
    expect(() => target.fill()).not.toThrow();
  });

  it("polygon fill with curves is a no-op", () => {
    const target = makeTarget();
    target.dispose();
    target.beginPath();
    target.rect(0, 0, 10, 10);
    expect(() => target.fill()).not.toThrow();
  });

  it("drawImage is a no-op", () => {
    const target = makeTarget();
    target.dispose();
    const src = new FakeBitmap() as unknown as ImageBitmap;
    expect(() => target.drawImage(src, 0, 0, 10, 10)).not.toThrow();
  });

  it("fillText is a no-op", () => {
    const target = makeTarget();
    target.dispose();
    expect(() => target.fillText("hi", 0, 0)).not.toThrow();
  });

  it("draws normally before dispose (guard is inert while live)", () => {
    const target = makeTarget();
    target.beginPath();
    target.ellipse(50, 50, 20, 10);
    expect(() => target.fill()).not.toThrow();
  });
});
