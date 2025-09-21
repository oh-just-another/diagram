import type { Bounds, LinkId } from "@oh-just-another/types";
import { getEdgePath, type Edge, type Scene } from "@oh-just-another/scene";

/**
 * Per-edge memo invalidated by identity of either the `Edge` ref or the
 * `Scene` ref. Edges' world AABB depends on endpoint shapes' positions —
 * a shape move replaces the shape ref but leaves the edge ref intact, so
 * a plain by-edge cache would go stale. Patches always replace the
 * `Scene` ref, so `(edge, scene)` together form a sound key.
 */
export class EdgeBoundsCache {
  private readonly entries = new Map<
    LinkId,
    { readonly edge: Edge; readonly scene: Scene; readonly value: Bounds | null }
  >();

  get(scene: Scene, edge: Edge): Bounds | null | undefined {
    const entry = this.entries.get(edge.id);
    if (!entry) return undefined;
    if (entry.edge !== edge || entry.scene !== scene) {
      this.entries.delete(edge.id);
      return undefined;
    }
    return entry.value;
  }

  set(scene: Scene, edge: Edge, value: Bounds | null): Bounds | null {
    this.entries.set(edge.id, { edge, scene, value });
    return value;
  }

  getOrCompute(scene: Scene, edge: Edge): Bounds | null {
    const cached = this.get(scene, edge);
    if (cached !== undefined) return cached;
    return this.set(scene, edge, computeEdgeWorldBounds(scene, edge));
  }

  invalidate(id: LinkId): void {
    this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }

  prune(scene: Scene): void {
    for (const id of this.entries.keys()) {
      if (!scene.edges.has(id)) this.entries.delete(id);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * AABB of the edge's polyline in world space. Returns `null` when the
 * path is unresolvable (missing endpoint shape). Pure with respect to
 * the `(scene, edge)` pair.
 */
export const computeEdgeWorldBounds = (scene: Scene, edge: Edge): Bounds | null => {
  const path = getEdgePath(scene, edge);
  if (!path || path.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of path) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

/**
 * Shared module-level cache. Survives across `renderEdges` calls — the
 * `(edge, scene)` identity key ensures stale entries fall out automatically
 * once a patch produces a new scene reference.
 */
export const sharedEdgeBoundsCache: EdgeBoundsCache = new EdgeBoundsCache();
