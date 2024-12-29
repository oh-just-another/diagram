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
  /** Total bytes currently held. */
  readonly bytesUsed: number;
  clear(): void;
}
