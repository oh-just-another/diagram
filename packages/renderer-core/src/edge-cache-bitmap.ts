import type { Edge } from "@oh-just-another/scene";

/**
 * Per-edge rasterised bitmap cache (). Mirror of
 * `ShapeBitmapCache` but keyed on `Edge` identity. Long-path
 * edges (orthogonal routes around obstacles, beziers with many
 * waypoints) cost real CPU per frame; caching the rasterised
 * stroke as an `ImageBitmap` lets pan / camera moves draw with
 * one `drawImage` call instead of a fresh `path → stroke` pass.
 *
 * Invalidation: every scene mutation produces a fresh edge object via
 * `apply(scene, patch)`, so reference inequality on the cached
 * `edgeRef` signals "stale". No version field needed.
 *
 * Hosts that don't want bitmaps in memory just don't instantiate
 * one — `renderEdges` ignores the cache when absent.
 */

export interface EdgeBitmapCache<V = unknown> {
 get(edge: Edge, zoomBucket: number): V | undefined;
 set(edge: Edge, zoomBucket: number, value: V): void;
 delete(edge: Edge, zoomBucket: number): void;
 clear(): void;
 readonly size: number;
}

interface Entry<V> {
 readonly edgeRef: Edge;
 readonly value: V;
}

const keyFor = (edge: Edge, zoomBucket: number): string => `${edge.id}@${zoomBucket}`;

export class InMemoryEdgeBitmapCache<V> implements EdgeBitmapCache<V> {
 private readonly entries = new Map<string, Entry<V>>();
 private readonly cap: number;

 constructor(cap = 256) {
  this.cap = cap;
 }

 get size(): number {
  return this.entries.size;
 }

 get(edge: Edge, zoomBucket: number): V | undefined {
  const key = keyFor(edge, zoomBucket);
  const e = this.entries.get(key);
  if (!e) return undefined;
  if (e.edgeRef !== edge) {
   this.entries.delete(key);
   return undefined;
  }
  this.entries.delete(key);
  this.entries.set(key, e);
  return e.value;
 }

 set(edge: Edge, zoomBucket: number, value: V): void {
  const key = keyFor(edge, zoomBucket);
  if (this.entries.has(key)) this.entries.delete(key);
  this.entries.set(key, { edgeRef: edge, value });
  if (this.entries.size > this.cap) {
   const oldest = this.entries.keys().next().value;
   if (oldest !== undefined) this.entries.delete(oldest);
  }
 }

 delete(edge: Edge, zoomBucket: number): void {
  this.entries.delete(keyFor(edge, zoomBucket));
 }

 clear(): void {
  this.entries.clear();
 }
}
