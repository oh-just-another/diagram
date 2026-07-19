import type { ElementBase } from "@oh-just-another/scene";
import { LruCache } from "./lru-cache.js";

/**
 * Per-shape rasterised cache. Keyed by the shape's identity reference —
 * since scene mutations always replace the shape object (`apply(scene,
 * patch)` produces fresh references), a cache hit is guaranteed to reflect
 * the exact rendered output of the cached version. Pan / zoom invalidation
 * is the host's job: keep zoom in a small "bucket" (e.g. round to 0.1) and
 * include it in the key.
 *
 * LRU-by-insertion-order with a count cap. Hosts can replace with their own
 * cache by implementing the same `get` / `set` / `delete` surface.
 */

export interface ElementBitmapCache<V = unknown> {
  get(shape: ElementBase, zoomBucket: number): V | undefined;
  set(shape: ElementBase, zoomBucket: number, value: V): void;
  delete(shape: ElementBase, zoomBucket: number): void;
  clear(): void;
  readonly size: number;
}

const keyFor = (shape: ElementBase, zoomBucket: number): string => `${shape.id}@${zoomBucket}`;

interface Entry<V> {
  readonly shapeRef: ElementBase;
  readonly value: V;
}

/**
 * In-memory LRU cache. Operates on shape identity (reference) —
 * a stale shape reference for the same id is a miss because the
 * cached entry's `shapeRef !== shape`. That is the invalidation
 * mechanism — no version field needed.
 */
export class InMemoryElementBitmapCache<V> implements ElementBitmapCache<V> {
  private readonly entries: LruCache<string, Entry<V>>;

  constructor(cap = 512) {
    this.entries = new LruCache(cap);
  }

  get size(): number {
    return this.entries.size;
  }

  get(shape: ElementBase, zoomBucket: number): V | undefined {
    const key = keyFor(shape, zoomBucket);
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.shapeRef !== shape) {
      // Reference changed → stale; evict so the slot is free.
      this.entries.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(shape: ElementBase, zoomBucket: number, value: V): void {
    this.entries.set(keyFor(shape, zoomBucket), { shapeRef: shape, value });
  }

  delete(shape: ElementBase, zoomBucket: number): void {
    this.entries.delete(keyFor(shape, zoomBucket));
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Quantise a continuous zoom value to a bucket. Buckets within a
 * power-of-two range share a cache entry so small zoom adjustments
 * don't blow the cache. `bucket = 2 ^ round(log2(zoom))`.
 */
export const zoomBucket = (zoom: number): number => {
  if (zoom <= 0) return 1;
  return 2 ** Math.round(Math.log2(zoom));
};
