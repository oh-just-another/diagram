import type { LayerId } from "@oh-just-another/types";
import { LruCache } from "./lru-cache.js";

/**
 * Per-layer composite cache. Caches the rasterised `LayerId @ zoomBucket`
 * composite so renderScene can replay unchanged layers via a single
 * `drawImage` instead of walking every shape on every frame.
 *
 * Invalidation: `invalidateLayer(id)` is called for each layer changed
 * this frame, so `get` then misses for those layers and the renderer
 * falls back to the per-shape walk + optionally re-caches the result via
 * the host's `compositeLayerBitmap` callback.
 *
 * `Map<LayerId @ zoomBucket → bitmap>` shape mirrors the per-shape /
 * per-edge caches; LRU by insertion order with a count cap.
 */

export interface LayerCompositeCache<V = unknown> {
  get(layerId: LayerId, zoomBucket: number): V | undefined;
  set(layerId: LayerId, zoomBucket: number, value: V): void;
  invalidateLayer(layerId: LayerId): void;
  clear(): void;
  readonly size: number;
}

const keyFor = (layerId: LayerId, zoomBucket: number): string => `${layerId}@${zoomBucket}`;

export class InMemoryLayerCompositeCache<V> implements LayerCompositeCache<V> {
  private readonly entries: LruCache<string, V>;

  constructor(cap = 32) {
    this.entries = new LruCache(cap);
  }

  get size(): number {
    return this.entries.size;
  }

  get(layerId: LayerId, zoomBucket: number): V | undefined {
    return this.entries.get(keyFor(layerId, zoomBucket));
  }

  set(layerId: LayerId, zoomBucket: number, value: V): void {
    this.entries.set(keyFor(layerId, zoomBucket), value);
  }

  /**
   * Drop every cached bucket for a layer (across all zoom buckets).
   * A single shape mutation invalidates the whole layer composite;
   * partial-invalidation would need region tracking inside the bitmap.
   */
  invalidateLayer(layerId: LayerId): void {
    const prefix = `${layerId}@`;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
