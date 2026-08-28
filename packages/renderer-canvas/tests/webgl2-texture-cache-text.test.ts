/**
 * Regression: the image-texture LRU must not count text-bitmap textures
 * against `WEBGL2_IMAGE_TEXTURE_CACHE_CAP`. A frame with more distinct
 * bitmap strings than the image cap (e.g. the first frame of a large
 * scene, before the MSDF atlas is warm) used to push the map over the cap
 * with entries the evictor refuses to drop, and its `while` never exited —
 * the page hung inside `fillText`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { WebGL2Target } from "../src/webgl2/webgl2-target";
import { WEBGL2_IMAGE_TEXTURE_CACHE_CAP } from "../src/constants";

const makeStubGl = () => {
  const base: Record<string, unknown> = {
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => null,
    getProgramInfoLog: () => null,
    getExtension: () => null,
    createTexture: () => ({}),
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return () => 1;
    },
  });
};

class FakeOffscreen {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext(): unknown {
    return {
      font: "",
      textAlign: "left",
      textBaseline: "top",
      fillStyle: "",
      scale: () => {},
      fillText: () => {},
      measureText: () => ({ width: 10 }),
    };
  }
}

const makeTarget = (): WebGL2Target => {
  const gl = makeStubGl();
  const canvas = { width: 100, height: 100, getContext: () => gl } as unknown as HTMLCanvasElement;
  return new WebGL2Target(canvas, 100, 100);
};

const textureCount = (t: WebGL2Target): number =>
  (t as unknown as { textures: Map<object, unknown> }).textures.size;

afterEach(() => {
  delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
});

describe("webgl2 image-texture cache vs text bitmaps", () => {
  it("fillText with more distinct strings than the image cap terminates and keeps them all", () => {
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = FakeOffscreen;
    const target = makeTarget();
    target.setFont("system-ui, sans-serif", 16, {});
    const n = WEBGL2_IMAGE_TEXTURE_CACHE_CAP + 6;
    for (let i = 0; i < n; i++) target.fillText(`Item ${String(i)}`, 0, 0);
    expect(textureCount(target)).toBe(n);
  });

  it("still caps image textures while text bitmaps stay resident", () => {
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = FakeOffscreen;
    const target = makeTarget();
    target.setFont("system-ui, sans-serif", 16, {});
    const texts = 10;
    for (let i = 0; i < texts; i++) target.fillText(`Label ${String(i)}`, 0, 0);
    const images = WEBGL2_IMAGE_TEXTURE_CACHE_CAP + 5;
    for (let i = 0; i < images; i++) target.drawImage(new FakeOffscreen(4, 4), 0, 0, 4, 4);
    expect(textureCount(target)).toBe(texts + WEBGL2_IMAGE_TEXTURE_CACHE_CAP);
  });
});
