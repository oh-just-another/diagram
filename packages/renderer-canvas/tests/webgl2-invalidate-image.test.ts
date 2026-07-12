/**
 * B6 — explicit GPU texture lifecycle: `WebGL2Target.invalidateImage(source)`
 * synchronously deletes the cached texture for a source so VRAM is released
 * when the host discards an image, instead of waiting for LRU pressure. Stub
 * GL records `deleteTexture` calls; no GPU in the test env.
 */
import { describe, expect, it, vi } from "vitest";
import { WebGL2Target } from "../src/webgl2-target";

const makeStubGl = (deleted: unknown[]) => {
  let texSeq = 0;
  const base: Record<string, unknown> = {
    createTexture: () => ({ tex: ++texSeq }),
    deleteTexture: (t: unknown) => {
      deleted.push(t);
    },
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return () => 1;
    },
  });
};

const makeTarget = (deleted: unknown[]): WebGL2Target => {
  const gl = makeStubGl(deleted);
  const canvas = {
    width: 100,
    height: 100,
    getContext: () => gl,
  } as unknown as HTMLCanvasElement;
  return new WebGL2Target(canvas, 100, 100);
};

// `isDrawableImageSource` checks the ImageBitmap brand — provide it in jsdom.
class FakeBitmap {
  readonly width = 4;
  readonly height = 4;
}
vi.stubGlobal("ImageBitmap", FakeBitmap);

const bitmap = (): ImageBitmap => new FakeBitmap() as unknown as ImageBitmap;

describe("WebGL2Target.invalidateImage", () => {
  it("deletes the cached texture exactly once and reports it", () => {
    const deleted: unknown[] = [];
    const target = makeTarget(deleted);
    const src = bitmap();
    target.drawImage(src, 0, 0, 10, 10); // uploads + caches the texture
    const before = deleted.length;

    expect(target.invalidateImage(src)).toBe(true);
    expect(deleted.length).toBe(before + 1);

    // Already gone — a second call is a no-op.
    expect(target.invalidateImage(src)).toBe(false);
    expect(deleted.length).toBe(before + 1);
  });

  it("returns false for a source that was never uploaded", () => {
    const deleted: unknown[] = [];
    const target = makeTarget(deleted);
    expect(target.invalidateImage(bitmap())).toBe(false);
    expect(deleted.length).toBe(0);
  });

  it("a re-draw after invalidation re-uploads a fresh texture", () => {
    const deleted: unknown[] = [];
    const target = makeTarget(deleted);
    const src = bitmap();
    target.drawImage(src, 0, 0, 10, 10);
    target.invalidateImage(src);
    target.drawImage(src, 0, 0, 10, 10); // must not throw; caches anew
    expect(target.invalidateImage(src)).toBe(true);
  });
});
