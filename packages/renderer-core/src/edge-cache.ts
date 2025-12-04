import type { Bounds, LinkId } from "@oh-just-another/types";
import { getLinkPath, type Link, type Scene } from "@oh-just-another/scene";

/**
 * Per-edge memo invalidated by identity of either the `Link` ref or the
 * `Scene` ref. Links' world AABB depends on endpoint shapes' positions —
 * a shape move replaces the shape ref but leaves the edge ref intact, so
 * a plain by-edge cache would go stale. Patches always replace the
 * `Scene` ref, so `(edge, scene)` together form a sound key.
 */
export class LinkBoundsCache {
  private readonly entries = new Map<
    LinkId,
    { readonly edge: Link; readonly scene: Scene; readonly value: Bounds | null }
  >();

  get(scene: Scene, edge: Link): Bounds | null | undefined {
    const entry = this.entries.get(edge.id);
    if (!entry) return undefined;
    if (entry.edge !== edge || entry.scene !== scene) {
      this.entries.delete(edge.id);
      return undefined;
    }
    return entry.value;
  }

  set(scene: Scene, edge: Link, value: Bounds | null): Bounds | null {
    this.entries.set(edge.id, { edge, scene, value });
    return value;
  }

  getOrCompute(scene: Scene, edge: Link): Bounds | null {
    const cached = this.get(scene, edge);
    if (cached !== undefined) return cached;
    return this.set(scene, edge, computeLinkWorldBounds(scene, edge));
  }

  invalidate(id: LinkId): void {
    this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }

  prune(scene: Scene): void {
    for (const id of this.entries.keys()) {
      if (!scene.links.has(id)) this.entries.delete(id);
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
export const computeLinkWorldBounds = (scene: Scene, edge: Link): Bounds | null => {
  const path = getLinkPath(scene, edge);
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
  // Inflate by stroke half-width + arrowhead reach. This keeps an
  // axis-aligned link (a horizontal/vertical line, otherwise a zero-area AABB)
  // non-degenerate, so dirty-rect union / viewport culling don't drop it. Also
  // covers arrowhead / thick-stroke overhang past the path.
  const heads = edge.arrowheads;
  const hasHead =
    (heads?.from !== undefined && heads.from !== "none") ||
    (heads?.to !== undefined && heads.to !== "none");
  const pad = Math.max(2, (edge.style.strokeWidth ?? 1) / 2 + (hasHead ? (heads?.size ?? 10) : 0));
  return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
};

/**
 * Shared module-level cache. Survives across `renderLinks` calls — the
 * `(edge, scene)` identity key ensures stale entries fall out automatically
 * once a patch produces a new scene reference.
 */
export const sharedLinkBoundsCache: LinkBoundsCache = new LinkBoundsCache();
