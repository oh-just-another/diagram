import {
  TILE_SIZE,
  type TileCache,
  type TileCacheEntry,
  type TileKey,
} from "@oh-just-another/renderer-core";
import type { Bounds, ElementId } from "@oh-just-another/types";
import {
  getElementsInLayer,
  getElementWorldBounds,
  getLayersInOrder,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { createOffscreenCanvas2DTarget } from "./offscreen.js";
import { Canvas2DTarget } from "./canvas-target.js";
import { getShapeRenderer } from "@oh-just-another/renderer-core";

/**
 * Main-thread Canvas2D tile compositor.
 *
 * Splits the visible viewport into a fixed-size world-space grid
 * (`TILE_SIZE` per side; default 2048 world units). Each tile is
 * rasterised once into its own OffscreenCanvas, stored in a
 * `TileCache`, and composited onto the main canvas via `drawImage`.
 * Pure pan re-composites from cache; zoom changes the bucket and may
 * invalidate.
 *
 * Designed for very large scenes where the per-frame `renderScene`
 * walks every visible shape — composite of N cached bitmaps is far
 * cheaper than re-rasterising N shapes.
 */

export interface ChangedShapeRecord {
  /** World bbox of the shape in the previous frame, or null if it was just added. */
  readonly before: Bounds | null;
  /** World bbox of the shape in the current frame, or null if it was just removed. */
  readonly after: Bounds | null;
}

export interface RenderViaTilesOptions {
  /** World-space rect currently visible. Tiles outside are skipped. */
  readonly viewport: Bounds;
  /** Persistent tile cache — same instance across frames. */
  readonly cache: TileCache<OffscreenCanvas>;
  /**
   * Element ids whose scene-reference changed since the previous frame,
   * each with the before/after world bbox. The compositor routes
   * invalidation by case:
   *   • removed   (after null)  → invalidateForElement (id present in
   *     reverse index)
   *   • added     (before null) → invalidateRect (no id yet)
   *   • mutated/moved (both)    → both rects
   */
  readonly changedElements?: ReadonlyMap<ElementId, ChangedShapeRecord>;
  /** Current zoom (used to pick the cache bucket). */
  readonly zoomBucket: number;
}

export const renderViaTiles = (
  scene: Scene,
  mainTarget: Canvas2DTarget,
  options: RenderViaTilesOptions,
): void => {
  const { viewport, cache, changedElements, zoomBucket } = options;

  // 1) Invalidate cached tiles per patch (covers add / remove / move).
  if (changedElements) {
    for (const [id, record] of changedElements) {
      cache.invalidateForPatch({
        ...(record.after === null ? { removedElementId: id } : {}),
        ...(record.before ? { beforeBounds: record.before } : {}),
        ...(record.after ? { afterBounds: record.after } : {}),
      });
    }
  }

  // 2) Visible tile range.
  const colMin = Math.floor(viewport.x / TILE_SIZE);
  const rowMin = Math.floor(viewport.y / TILE_SIZE);
  const colMax = Math.floor((viewport.x + viewport.width) / TILE_SIZE);
  const rowMax = Math.floor((viewport.y + viewport.height) / TILE_SIZE);

  // 3) For each visible tile, hit cache or render fresh.
  for (let row = rowMin; row <= rowMax; row++) {
    for (let col = colMin; col <= colMax; col++) {
      const key: TileKey = { col, row, zoom: zoomBucket };
      let entry: TileCacheEntry<OffscreenCanvas> | undefined = cache.get(key);
      if (!entry) {
        const fresh = rasteriseTile(scene, col, row, zoomBucket);
        if (!fresh) continue;
        cache.set(fresh);
        entry = fresh;
      }
      // Composite — draw the cached bitmap at its world position. The
      // main target's transform already maps world→screen.
      mainTarget.drawImage(
        entry.bitmap,
        entry.bounds.x,
        entry.bounds.y,
        entry.bounds.width,
        entry.bounds.height,
      );
    }
  }
};

/**
 * Render a single tile's worth of shapes into a fresh OffscreenCanvas
 * sized at `TILE_SIZE * zoomBucket` device pixels per side. Returns
 * `null` when the tile contains no shapes.
 */
const rasteriseTile = (
  scene: Scene,
  col: number,
  row: number,
  zoomBucket: number,
): TileCacheEntry<OffscreenCanvas> | null => {
  if (typeof OffscreenCanvas === "undefined") return null;
  const worldX = col * TILE_SIZE;
  const worldY = row * TILE_SIZE;
  const worldBounds: Bounds = {
    x: worldX,
    y: worldY,
    width: TILE_SIZE,
    height: TILE_SIZE,
  };
  const shapes = shapesIntersectingTile(scene, worldBounds);
  if (shapes.length === 0) return null;

  // Bitmap size — `TILE_SIZE * zoomBucket` device pixels so the tile
  // stays crisp at this bucket. Higher buckets allocate more memory;
  // cache eviction keeps total bounded.
  const bitmapSize = Math.max(1, Math.round(TILE_SIZE * zoomBucket));
  const { canvas, target } = createOffscreenCanvas2DTarget(bitmapSize, bitmapSize);

  // World → tile-local + zoom scaling.
  target.save();
  target.scale(zoomBucket, zoomBucket);
  target.translate(-worldX, -worldY);
  for (const shape of shapes) {
    const renderer = getShapeRenderer(shape.type);
    if (!renderer) continue;
    target.save();
    target.translate(shape.position.x, shape.position.y);
    if (shape.rotation !== 0) target.rotate(shape.rotation);
    if (shape.scale.x !== 1 || shape.scale.y !== 1) {
      target.scale(shape.scale.x, shape.scale.y);
    }
    renderer(shape, target);
    target.restore();
  }
  target.restore();

  // 4 bytes per pixel (RGBA) — byte accounting for LRU.
  const bytes = bitmapSize * bitmapSize * 4;
  return {
    key: { col, row, zoom: zoomBucket },
    bitmap: canvas,
    bounds: worldBounds,
    bytes,
    shapes: shapes.map((s) => s.id),
  };
};

const shapesIntersectingTile = (scene: Scene, tileBounds: Bounds): readonly Element[] => {
  const out: Element[] = [];
  for (const layer of getLayersInOrder(scene)) {
    if (!layer.visible) continue;
    for (const shape of getElementsInLayer(scene, layer.id)) {
      const b = getElementWorldBounds(shape);
      if (intersects(b, tileBounds)) out.push(shape);
    }
  }
  return out;
};

const intersects = (a: Bounds, b: Bounds): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;
