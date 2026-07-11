import { afterEach, describe, expect, it, vi } from "vitest";
import { WebGL2Target } from "../src/webgl2-target";

/**
 * WebGL2 image cropping. The crop rect (normalised [0,1] fractions of the
 * source) is applied as a UV sub-rect via the `uUvOffset` / `uUvScale`
 * uniforms — `vUV = aUV * uUvScale + uUvOffset`. Identity (no crop) must set
 * offset (0,0) + scale (1,1); a crop narrows the sampled region.
 *
 * No GPU in the test env, so the target is driven by a stub GL whose
 * `getUniformLocation` returns the uniform NAME as its location token, letting
 * us key recorded `uniform2f` calls by which uniform they targeted.
 */

interface Uniform2fCall {
  readonly loc: string;
  readonly x: number;
  readonly y: number;
}

const makeStubGl = (calls: Uniform2fCall[]) => {
  const base: Record<string, unknown> = {
    getUniformLocation: (_program: unknown, name: unknown) => name,
    uniform2f: (loc: unknown, x: number, y: number) => {
      calls.push({ loc: String(loc), x, y });
    },
  };
  // Everything else → a no-op that doubles as a truthy handle / enum so shader
  // compile + link + texture upload all "succeed".
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return () => 1;
    },
  });
};

const makeTarget = (calls: Uniform2fCall[]): WebGL2Target => {
  const gl = makeStubGl(calls);
  const canvas = {
    width: 100,
    height: 100,
    getContext: () => gl,
  } as unknown as HTMLCanvasElement;
  return new WebGL2Target(canvas, 100, 100);
};

// Minimal ImageBitmap stand-in: `isDrawableImageSource` only needs the
// `instanceof ImageBitmap` brand; the width/height mirror a real bitmap.
class FakeBitmap {
  readonly width = 4;
  readonly height = 4;
}

const lastUv = (calls: Uniform2fCall[], loc: string): Uniform2fCall | undefined =>
  calls.filter((c) => c.loc === loc).at(-1);

describe("WebGL2Target image crop → UV uniforms", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps the crop rect into uUvOffset / uUvScale", () => {
    // isDrawableImageSource checks `value instanceof ImageBitmap`.
    vi.stubGlobal("ImageBitmap", FakeBitmap);
    const calls: Uniform2fCall[] = [];
    const t = makeTarget(calls);

    t.drawImage(new FakeBitmap(), 0, 0, 120, 80, false, {
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5,
    });

    const offset = lastUv(calls, "uUvOffset");
    const scale = lastUv(calls, "uUvScale");
    expect(offset).toEqual({ loc: "uUvOffset", x: 0.25, y: 0.25 });
    expect(scale).toEqual({ loc: "uUvScale", x: 0.5, y: 0.5 });
  });

  it("resets to identity (0,0)+(1,1) when no crop is supplied", () => {
    vi.stubGlobal("ImageBitmap", FakeBitmap);
    const calls: Uniform2fCall[] = [];
    const t = makeTarget(calls);

    t.drawImage(new FakeBitmap(), 0, 0, 120, 80, false);

    expect(lastUv(calls, "uUvOffset")).toEqual({ loc: "uUvOffset", x: 0, y: 0 });
    expect(lastUv(calls, "uUvScale")).toEqual({ loc: "uUvScale", x: 1, y: 1 });
  });

  it("treats a full-image crop as identity", () => {
    vi.stubGlobal("ImageBitmap", FakeBitmap);
    const calls: Uniform2fCall[] = [];
    const t = makeTarget(calls);

    t.drawImage(new FakeBitmap(), 0, 0, 120, 80, false, { x: 0, y: 0, width: 1, height: 1 });

    expect(lastUv(calls, "uUvOffset")).toEqual({ loc: "uUvOffset", x: 0, y: 0 });
    expect(lastUv(calls, "uUvScale")).toEqual({ loc: "uUvScale", x: 1, y: 1 });
  });
});
