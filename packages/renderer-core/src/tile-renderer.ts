import type { Bounds, ShapeId } from "@oh-just-another/types";

/**
 * Tile-based rendering scaffold. The scene is split into a fixed-size
 * world-space grid; each tile is rasterised once into an
 * OffscreenCanvas / ImageBitmap and re-composited on pan without
 * re-rendering. Zoom changes invalidate the bucket.
 *
 * This file ships the constants and cache interface so backends can
 * adopt the API.
 */

/** Side length of one tile in world units. */
export const TILE_SIZE = 2048;

/** Memory cap for cached tile bitmaps (bytes). */
export const MAX_TILE_CACHE_BYTES = 256 * 1024 * 1024;

/**
 * Below this zoom we drop to LOD: cache tiles render only AABBs
 * (no stroke / text / detail) so 1 M+ shape scenes stay smooth.
 */
export const LOD_THRESHOLD = 0.25;

export interface TileKey {
  /** Tile column in world-space grid. */
  readonly col: number;
  /** Tile row in world-space grid. */
  readonly row: number;
  /** Zoom bucket (power of two). */
  readonly zoom: number;
}

export interface TileCacheEntry<B = unknown> {
  readonly key: TileKey;
  readonly bitmap: B;
  /** World bounds covered by this tile. */
  readonly bounds: Bounds;
  /** Bytes used by this bitmap (for LRU eviction accounting). */
  readonly bytes: number;
  /** Shape ids currently visible in this tile (for invalidation). */
  readonly shapes: readonly ShapeId[];
}

export interface TileCache<B = unknown> {
  get(key: TileKey): TileCacheEntry<B> | undefined;
  set(entry: TileCacheEntry<B>): void;
  /**
   * Drop any cached tile that contains the given shape id. Called
   * by the editor when a shape's scene reference changes.
   */
  invalidateForShape(id: ShapeId): void;
  /**
   * Drop any cached tile whose `bounds` intersect the given world
   * rectangle. Used by the editor's patch hook when a shape is
   * added (no previous id in the reverse index) or moved (the
   * before/after AABB union covers both old and new tiles).
   */
  invalidateRect(rect: Bounds): void;
  /**
   * Convenience routing used by editor patch pipelines: dispatches
   * to `invalidateForShape` (remove), `invalidateRect` (add), or
   * both (move) based on which of `removedShapeId` / `beforeBounds`
   * / `afterBounds` are present.
   */
  invalidateForPatch(options: {
    readonly removedShapeId?: ShapeId;
    readonly beforeBounds?: Bounds;
    readonly afterBounds?: Bounds;
  }): void;
  /** Total bytes currently held. */
  readonly bytesUsed: number;
  clear(): void;
}

const keyOf = (k: TileKey): string => `${k.col},${k.row}@${k.zoom}`;

/**
 * Reference TileCache backed by a Map with LRU eviction by total
 * bytes. Bitmap-agnostic — the eviction logic tracks the `bytes`
 * field reported by the host; whatever stores ImageBitmap /
 * OffscreenCanvas / SharedArrayBuffer is the host's call.
 *
 * Invalidation is shape-id-indexed: every `set` also updates a
 * reverse index `Map<ShapeId, Set<tileKey>>` so the editor's
 * patch hook can call `invalidateForShape(id)` in O(touched tiles)
 * instead of scanning every tile.
 */
export class InMemoryTileCache<B = unknown> implements TileCache<B> {
  private readonly entries = new Map<string, TileCacheEntry<B>>();
  private readonly tilesByShape = new Map<ShapeId, Set<string>>();
  private bytes = 0;
  private readonly cap: number;

  constructor(byteCap: number = MAX_TILE_CACHE_BYTES) {
    this.cap = byteCap;
  }

  get bytesUsed(): number {
    return this.bytes;
  }

  get(key: TileKey): TileCacheEntry<B> | undefined {
    const id = keyOf(key);
    const e = this.entries.get(id);
    if (!e) return undefined;
    // Touch — re-insert at the tail to mark recently used.
    this.entries.delete(id);
    this.entries.set(id, e);
    return e;
  }

  set(entry: TileCacheEntry<B>): void {
    const id = keyOf(entry.key);
    const prior = this.entries.get(id);
    if (prior) {
      this.bytes -= prior.bytes;
      for (const sid of prior.shapes) this.tilesByShape.get(sid)?.delete(id);
    }
    this.entries.set(id, entry);
    this.bytes += entry.bytes;
    for (const sid of entry.shapes) {
      let bucket = this.tilesByShape.get(sid);
      if (!bucket) {
        bucket = new Set();
        this.tilesByShape.set(sid, bucket);
      }
      bucket.add(id);
    }
    this.evictIfOverCap();
  }

  invalidateForShape(shapeId: ShapeId): void {
    const bucket = this.tilesByShape.get(shapeId);
    if (!bucket) return;
    for (const tileId of bucket) {
      const e = this.entries.get(tileId);
      if (!e) continue;
      this.entries.delete(tileId);
      this.bytes -= e.bytes;
      for (const sid of e.shapes) {
        if (sid !== shapeId) this.tilesByShape.get(sid)?.delete(tileId);
      }
    }
    this.tilesByShape.delete(shapeId);
  }

  invalidateRect(rect: Bounds): void {
    const rMaxX = rect.x + rect.width;
    const rMaxY = rect.y + rect.height;
    for (const [tileId, entry] of [...this.entries]) {
      const b = entry.bounds;
      const bMaxX = b.x + b.width;
      const bMaxY = b.y + b.height;
      const disjoint = bMaxX <= rect.x || b.x >= rMaxX || bMaxY <= rect.y || b.y >= rMaxY;
      if (disjoint) continue;
      this.entries.delete(tileId);
      this.bytes -= entry.bytes;
      for (const sid of entry.shapes) this.tilesByShape.get(sid)?.delete(tileId);
    }
  }

  clear(): void {
    this.entries.clear();
    this.tilesByShape.clear();
    this.bytes = 0;
  }

  /**
   * Convenience hook for the editor's patch pipeline. Looks at a
   * scene Patch and invalidates touched tiles via the right
   * cheap path:
   *   • shape removed → invalidateForShape (id still in reverse index)
   *   • shape added   → invalidateRect (no id yet — drop tiles that
   *                     touch the new shape's bounds)
   *   • shape moved   → both: removeForShape (old tiles) + rect
   *                     (new bounds)
   * Caller computes the bounds via `getShapeWorldBounds(before|after)`
   * since this package is pure and doesn't know about Shape geometry.
   */
  invalidateForPatch(
    options: {
      readonly removedShapeId?: ShapeId;
      readonly beforeBounds?: Bounds;
      readonly afterBounds?: Bounds;
    },
  ): void {
    if (options.removedShapeId) this.invalidateForShape(options.removedShapeId);
    if (options.beforeBounds) this.invalidateRect(options.beforeBounds);
    if (options.afterBounds) this.invalidateRect(options.afterBounds);
  }

  private evictIfOverCap(): void {
    if (this.bytes <= this.cap) return;
    // Map preserves insertion order — oldest entry first.
    for (const [id, entry] of this.entries) {
      if (this.bytes <= this.cap) break;
      this.entries.delete(id);
      this.bytes -= entry.bytes;
      for (const sid of entry.shapes) this.tilesByShape.get(sid)?.delete(id);
    }
  }
}
