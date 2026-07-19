import type { Bounds, ElementId } from "@oh-just-another/types";
import { getElementWorldBounds, type Scene, type ElementBase } from "@oh-just-another/scene";

/**
 * Per-shape memo with object-identity invalidation. Cached value sticks
 * until the underlying shape reference changes — and because every scene
 * op (`updateElement` / `moveElement` / ...) returns a new shape object, the
 * cache invalidates automatically without the caller threading versions
 * through.
 *
 * Caches survive across frames; pair with `prune(scene)` after large
 * deletions if memory matters. For ephemeral, single-render memos use
 * a fresh `ElementCache` instance (cheap to construct).
 */
export class ElementCache<T> {
  private readonly entries = new Map<ElementId, { readonly ref: ElementBase; value: T }>();

  get(shape: ElementBase): T | undefined {
    const entry = this.entries.get(shape.id);
    if (!entry) return undefined;
    if (entry.ref !== shape) {
      this.entries.delete(shape.id);
      return undefined;
    }
    return entry.value;
  }

  set(shape: ElementBase, value: T): T {
    this.entries.set(shape.id, { ref: shape, value });
    return value;
  }

  /**
   * Lazy memo. Returns the cached value if `shape` is the same reference
   * as the one we cached against; otherwise runs `compute`, stores the
   * result, and returns it.
   */
  getOrCompute(shape: ElementBase, compute: (s: ElementBase) => T): T {
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
      if (!scene.elements.has(id)) this.entries.delete(id);
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
 * `getElementWorldBounds` is pure — same shape ref → same bounds — so a
 * by-identity cache is sound.
 */
export const sharedBoundsCache: ElementCache<Bounds> = new ElementCache<Bounds>();

export const cachedWorldBounds = (cache: ElementCache<Bounds>, shape: ElementBase): Bounds =>
  cache.getOrCompute(shape, getElementWorldBounds);
