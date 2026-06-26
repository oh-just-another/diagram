import {
  getLayersInOrder,
  getElementsInLayer,
  getWorldToScreen,
  isText,
  type Scene,
  type ElementBase,
  type SpatialGrid,
} from "@oh-just-another/scene";
import type { Bounds, LayerId, ElementId } from "@oh-just-another/types";
import { bounds as B, matrix } from "@oh-just-another/math";
import type { RenderTarget } from "./render-target.js";
import { getElementRenderer } from "./shape-renderer.js";
import { cachedWorldBounds, ElementCache } from "./shape-cache.js";
import { DEFAULT_PLACEHOLDER_FILL } from "./constants.js";
import type { LayerCompositeCache } from "./layer-cache-composite.js";
import { zoomBucket as bucketFor } from "./shape-cache-bitmap.js";

/**
 * Zoom-based level-of-detail thresholds. Each threshold turns on a
 * cheaper render path when the scene zoom drops below it:
 *
 * - **placeholder** → draw a flat fill at the shape's world AABB and
 *   skip the registered renderer entirely. Highest savings, biggest
 *   visual fidelity loss; reserve for very-zoomed-out overviews.
 * - **hideText** → skip text shapes (their wrap+measure cost is high).
 *
 * Thresholds compare against `scene.viewport.zoom` (1.0 = 1:1 pixels).
 * Omit a threshold to disable that level.
 */
export interface LodOptions {
  readonly placeholder?: number;
  readonly hideText?: number;
}

export interface RenderSceneOptions {
  /** Skip clearing the target before drawing. Default: false. */
  readonly skipClear?: boolean;
  /** Called for shapes whose `type` has no registered renderer. Default: ignore. */
  readonly onUnknownElement?: (shape: ElementBase) => void;
  /**
   * World-space viewport bounds. When provided, shapes whose AABB does
   * not intersect this rectangle are skipped (viewport culling). Pass
   * a slightly inflated rect to avoid pop-in during pan.
   */
  readonly viewport?: Bounds;
  /**
   * Persistent bounds cache. When omitted a fresh per-render cache is
   * created — fine for hot paths because lookups inside one frame still
   * amortize. Pass a long-lived cache from `Editor` to share work across
   * frames, hit-test, and overlay.
   */
  readonly boundsCache?: ElementCache<Bounds>;
  /**
   * Pre-built spatial index. When provided together with `viewport`, the
   * renderer picks candidate shapes from the index and skips full layer
   * scans — pays off around ~10k shapes.
   */
  readonly spatialIndex?: SpatialGrid;
  /**
   * Zoom thresholds for cheaper render paths. See {@link LodOptions}.
   */
  readonly lod?: LodOptions;
  /**
   * Placeholder fill colour. Defaults to `#bbb`. Pick something close
   * to the average shape colour so the transition is unobtrusive.
   */
  readonly placeholderFill?: string;
  /**
   * Optional dirty rectangle in **world** coords. When set:
   *   • the renderer clears only the corresponding screen region;
   *   • shapes whose world AABB doesn't intersect the dirty rect are
   *     skipped entirely.
   * Combined with shape-identity tracking by the host this drops most
   * of the per-frame work for "single shape moves on otherwise static
   * scene".
   */
  readonly dirtyWorld?: Bounds;
  /**
   * Shapes to render with reduced alpha (modern-style group isolation).
   * For each shape whose `id` appears in this set, the renderer sets
   * `globalAlpha = dimOpacity` for the per-shape draw pass before
   * dispatching to the registered renderer.
   *
   * Caveat: shapes whose own `style.opacity` is explicitly set will
   * have their renderer call `setOpacity` again and override the
   * dim — the dim affects only the common case where shapes don't
   * carry an explicit opacity. Acceptable for the isolation UX
   * because outsiders are usually plain opaque shapes.
   */
  readonly dimElements?: ReadonlySet<ElementId>;
  /**
   * Alpha to use for `dimElements`. Default 1 (no-op). Hosts using the
   * isolation feature should pass their `ISOLATION_DIM_OPACITY`
   * constant.
   */
  readonly dimOpacity?: number;
  /**
   * Element ids that should NOT render this pass. The host computes
   * which shapes are effectively hidden (e.g. via group hide
   * propagation) and forwards the set here.
   */
  readonly hideElements?: ReadonlySet<ElementId>;
  /**
   * Per-layer composite bitmap cache. When supplied along with
   * `compositeLayerBitmap`, unchanged layers (i.e. not present in
   * `dirtyLayerIds`) are drawn from a single cached `drawImage` call
   * instead of walking every shape.
   *
   * Pass `dirtyLayerIds` so the renderer knows which layers to
   * re-rasterise. Without it the cache is treated as cold every
   * frame (defensive — better stale work than a stale visual).
   */
  readonly layerCompositeCache?: LayerCompositeCache;
  readonly dirtyLayerIds?: ReadonlySet<LayerId>;
  /**
   * Host-side layer rasteriser. Receives the layer id, the active
   * zoom bucket, and the scene; returns the bitmap to cache or
   * `null` to opt out. The kernel doesn't ship one — OffscreenCanvas
   * creation is the backend's job.
   */
  readonly compositeLayerBitmap?: (layerId: LayerId, zoomBucket: number, scene: Scene) => unknown;
}

/**
 * Renders the `main` z-stack of a scene onto a single target.
 *
 * Order of operations:
 *   1. Optionally clear the surface.
 *   2. Apply the scene's world-to-screen transform.
 *   3. For each visible layer (bottom → top): for each shape (bottom → top):
 *      save state, push the shape's local TRS, invoke its registered renderer.
 *
 * This function does not draw edges, selection handles, or grids — those
 * either live on different layers (`background` / `overlay`) or are added by
 * higher-level packages.
 */
export const renderScene = (
  scene: Scene,
  target: RenderTarget,
  options: RenderSceneOptions = {},
): void => {
  const w2s = getWorldToScreen(scene.viewport);
  const dirtyWorld = options.dirtyWorld;
  if (!options.skipClear) {
    if (dirtyWorld) {
      // Project the dirty rect to screen pixels, inflate by a few
      // pixels to cover anti-aliased stroke fuzz.
      const corners = [
        matrix.applyToPoint(w2s, { x: dirtyWorld.x, y: dirtyWorld.y }),
        matrix.applyToPoint(w2s, {
          x: dirtyWorld.x + dirtyWorld.width,
          y: dirtyWorld.y + dirtyWorld.height,
        }),
      ];
      const screen = B.expand(B.fromPoints(corners), 2);
      target.clear(screen);
    } else {
      target.clear();
    }
  }

  target.save();
  target.setTransform(w2s);

  const boundsCache = options.boundsCache ?? new ElementCache<Bounds>();
  const viewport = options.viewport;
  // Spatial-index candidate set: when present, restricts the per-layer
  // walk to shapes the index considers possibly-visible. Without it the
  // per-shape AABB check on a cached bounds is still cheap (~50ns), so
  // the index is only worth the build cost for very large scenes.
  let candidates: ReadonlySet<ElementId> | null = null;
  if (viewport && options.spatialIndex) {
    candidates = options.spatialIndex.query(viewport);
  }

  const zoom = scene.viewport.zoom;
  const lod = options.lod;
  const usePlaceholder = lod?.placeholder !== undefined && zoom < lod.placeholder;
  const dropText = lod?.hideText !== undefined && zoom < lod.hideText;
  const placeholderFill = options.placeholderFill ?? DEFAULT_PLACEHOLDER_FILL;

  const layerCache = options.layerCompositeCache;
  const dirtyLayers = options.dirtyLayerIds;
  const compositeLayerBitmap = options.compositeLayerBitmap;
  const zoomBucket = bucketFor(zoom);
  const layerBoundsFor = (layerId: LayerId): Bounds | null => {
    let acc: Bounds | null = null;
    for (const shape of getElementsInLayer(scene, layerId)) {
      const bb = cachedWorldBounds(boundsCache, shape);
      acc = acc ? B.union(acc, bb) : bb;
    }
    return acc;
  };

  for (const layer of getLayersInOrder(scene)) {
    if (!layer.visible) continue;

    // Per-layer composite cache fast path. Only fires when the host
    // plugged a cache + a layer rasteriser; the kernel ships no default
    // rasteriser (OffscreenCanvas creation is the backend's job). Drop
    // dirty layers from the cache so the bitmap isn't re-used after a
    // mutation.
    if (layerCache && compositeLayerBitmap) {
      if (dirtyLayers?.has(layer.id)) layerCache.invalidateLayer(layer.id);
      let bitmap = layerCache.get(layer.id, zoomBucket);
      if (bitmap === undefined) {
        const fresh = compositeLayerBitmap(layer.id, zoomBucket, scene);
        if (fresh !== null) {
          layerCache.set(layer.id, zoomBucket, fresh);
          bitmap = fresh;
        }
      }
      if (bitmap !== undefined) {
        const bb = layerBoundsFor(layer.id);
        if (bb) target.drawImage(bitmap, bb.x, bb.y, bb.width, bb.height);
        continue;
      }
    }

    for (const shape of getElementsInLayer(scene, layer.id)) {
      if (options.hideElements?.has(shape.id)) continue;
      if (candidates && !candidates.has(shape.id)) continue;
      if (viewport) {
        const bb = cachedWorldBounds(boundsCache, shape);
        if (!B.intersects(bb, viewport)) continue;
      }
      if (dirtyWorld) {
        const bb = cachedWorldBounds(boundsCache, shape);
        if (!B.intersects(bb, dirtyWorld)) continue;
      }

      if (dropText && isText(shape)) continue;

      if (usePlaceholder) {
        // Draw the AABB directly in world coords — skip the renderer
        // entirely. The shape's TRS is folded into the cached bounds.
        const bb = cachedWorldBounds(boundsCache, shape);
        target.setFill(placeholderFill);
        target.setStrokeWidth(0);
        target.beginPath();
        target.rect(bb.x, bb.y, bb.width, bb.height);
        target.fill();
        continue;
      }

      const renderer = getElementRenderer(shape.type);
      if (!renderer) {
        options.onUnknownElement?.(shape);
        continue;
      }

      target.save();
      // Isolation dim — set BEFORE the renderer runs so any
      // shape-style-specific setOpacity inside the renderer can
      // override (see RenderSceneOptions.dimElements).
      if (options.dimElements?.has(shape.id) && options.dimOpacity !== undefined) {
        target.setOpacity(options.dimOpacity);
      }
      target.translate(shape.position.x, shape.position.y);
      if (shape.rotation !== 0) target.rotate(shape.rotation);
      if (shape.scale.x !== 1 || shape.scale.y !== 1) {
        target.scale(shape.scale.x, shape.scale.y);
      }
      renderer(shape, target, { zoom });
      target.restore();
    }
  }

  target.restore();
};
