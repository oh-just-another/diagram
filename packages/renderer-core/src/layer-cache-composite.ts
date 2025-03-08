import type { LayerId } from "@oh-just-another/types";

/**
 * Per-layer composite cache. Caches the rasterised `LayerId @ zoomBucket`
 * composite so renderScene can replay unchanged layers via a single
 * `drawImage` instead of walking every shape on every frame.
 *
 * Invalidation: the editor's patch pipeline knows which layers had any
 * shape/edge change this frame; it passes that set down to renderScene
 * which calls `invalidateLayer(id)` for each. The
 * `LayerCompositeCache.get` then misses for those layers and the
 * renderer falls back to the per-shape walk + optionally caches the
 * result via the host's `compositeLayerBitmap` callback.
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
  private readonly entries = new Map<string, V>();
  private readonly cap: number;

  constructor(cap = 32) {
    this.cap = cap;
  }

  get size(): number {
    return this.entries.size;
  }

  get(layerId: LayerId, zoomBucket: number): V | undefined {
    const key = keyFor(layerId, zoomBucket);
    const v = this.entries.get(key);
    if (v === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, v);
    return v;
  }

  set(layerId: LayerId, zoomBucket: number, value: V): void {
    const key = keyFor(layerId, zoomBucket);
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.cap) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
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
