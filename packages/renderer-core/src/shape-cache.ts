import type { Bounds, ElementId } from "@oh-just-another/types";
import { getShapeWorldBounds, type Scene, type ShapeBase } from "@oh-just-another/scene";

/**
 * Per-shape memo with object-identity invalidation. Cached value sticks
 * until the underlying shape reference changes — and because every scene
 * op (`updateShape` / `moveShape` / ...) returns a new shape object, the
 * cache invalidates automatically without the caller threading versions
 * through.
 *
 * Caches survive across frames; pair with `prune(scene)` after large
 * deletions if memory matters. For ephemeral, single-render memos use
 * a fresh `ShapeCache` instance (cheap to construct).
 */
export class ShapeCache<T> {
  private readonly entries = new Map<ElementId, { readonly ref: ShapeBase; value: T }>();

  get(shape: ShapeBase): T | undefined {
    const entry = this.entries.get(shape.id);
    if (!entry) return undefined;
    if (entry.ref !== shape) {
      this.entries.delete(shape.id);
      return undefined;
    }
    return entry.value;
  }

  set(shape: ShapeBase, value: T): T {
    this.entries.set(shape.id, { ref: shape, value });
    return value;
  }

  /**
   * Lazy memo. Returns the cached value if `shape` is the same reference
   * as the one we cached against; otherwise runs `compute`, stores the
   * result, and returns it.
   */
  getOrCompute(shape: ShapeBase, compute: (s: ShapeBase) => T): T {
    const cached = this.get(shape);
    if (cached !== undefined) return cached;
    return this.set(shape, compute(shape));
  }

  invalidate(id: ElementId): void {
    this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }

  /** Drop entries whose shape is no longer in the scene. */
  prune(scene: Scene): void {
    for (const id of this.entries.keys()) {
      if (!scene.shapes.has(id)) this.entries.delete(id);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * Shared module-level cache for world-space bounds. Used by `renderScene`
 * for viewport culling and reusable from outside (hit-test, overlay) so
 * a single computation amortizes across passes.
 *
 * `getShapeWorldBounds` is pure — same shape ref → same bounds — so a
 * by-identity cache is sound.
 */
export const sharedBoundsCache: ShapeCache<Bounds> = new ShapeCache<Bounds>();

export const cachedWorldBounds = (cache: ShapeCache<Bounds>, shape: ShapeBase): Bounds =>
  cache.getOrCompute(shape, getShapeWorldBounds);
