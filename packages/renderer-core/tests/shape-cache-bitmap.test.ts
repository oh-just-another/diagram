import { describe, expect, it } from "vitest";
import type { ElementBase } from "@oh-just-another/scene";
import { InMemoryElementBitmapCache, zoomBucket } from "../src/caches/shape-cache-bitmap";

const shape = (id: string): ElementBase =>
  ({ id, type: "rectangle", position: { x: 0, y: 0 } }) as unknown as ElementBase;

describe("InMemoryElementBitmapCache", () => {
  it("stores and retrieves by shape identity + zoom bucket", () => {
    const cache = new InMemoryElementBitmapCache<string>();
    const a = shape("a");
    cache.set(a, 1, "bitmap-a@1");
    expect(cache.get(a, 1)).toBe("bitmap-a@1");
    expect(cache.size).toBe(1);
  });

  it("misses on an unknown key", () => {
    const cache = new InMemoryElementBitmapCache<string>();
    expect(cache.get(shape("nope"), 1)).toBeUndefined();
  });

  it("keeps separate entries per zoom bucket", () => {
    const cache = new InMemoryElementBitmapCache<string>();
    const a = shape("a");
    cache.set(a, 1, "at-1");
    cache.set(a, 2, "at-2");
    expect(cache.get(a, 1)).toBe("at-1");
    expect(cache.get(a, 2)).toBe("at-2");
    expect(cache.size).toBe(2);
  });

  it("treats a new reference with the same id as stale and evicts it", () => {
    const cache = new InMemoryElementBitmapCache<string>();
    const v1 = shape("a");
    cache.set(v1, 1, "old");
    // Scene mutation replaces the object: same id, new reference.
    const v2 = shape("a");
    expect(cache.get(v2, 1)).toBeUndefined();
    // Stale entry was evicted, not just skipped.
    expect(cache.size).toBe(0);
    expect(cache.get(v1, 1)).toBeUndefined();
  });

  it("delete removes a single (shape, bucket) entry", () => {
    const cache = new InMemoryElementBitmapCache<string>();
    const a = shape("a");
    cache.set(a, 1, "at-1");
    cache.set(a, 2, "at-2");
    cache.delete(a, 1);
    expect(cache.get(a, 1)).toBeUndefined();
    expect(cache.get(a, 2)).toBe("at-2");
  });

  it("clear empties the cache", () => {
    const cache = new InMemoryElementBitmapCache<string>();
    cache.set(shape("a"), 1, "x");
    cache.set(shape("b"), 1, "y");
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("evicts least-recently-used entries beyond the cap", () => {
    const cache = new InMemoryElementBitmapCache<string>(2);
    const a = shape("a");
    const b = shape("b");
    const c = shape("c");
    cache.set(a, 1, "a");
    cache.set(b, 1, "b");
    cache.set(c, 1, "c");
    expect(cache.size).toBe(2);
    expect(cache.get(a, 1)).toBeUndefined();
    expect(cache.get(b, 1)).toBe("b");
    expect(cache.get(c, 1)).toBe("c");
  });
});

describe("zoomBucket", () => {
  it("returns 1 for zero and negative zoom", () => {
    expect(zoomBucket(0)).toBe(1);
    expect(zoomBucket(-3)).toBe(1);
  });

  it("quantises to the nearest power of two", () => {
    expect(zoomBucket(1)).toBe(1);
    expect(zoomBucket(2)).toBe(2);
    expect(zoomBucket(4)).toBe(4);
    expect(zoomBucket(0.5)).toBe(0.5);
    // 1.3 → log2 ≈ 0.38 → rounds to 0 → bucket 1.
    expect(zoomBucket(1.3)).toBe(1);
    // 3 → log2 ≈ 1.58 → rounds to 2 → bucket 4.
    expect(zoomBucket(3)).toBe(4);
  });

  it("shares one bucket across small zoom adjustments", () => {
    expect(zoomBucket(0.95)).toBe(zoomBucket(1.05));
  });
});
