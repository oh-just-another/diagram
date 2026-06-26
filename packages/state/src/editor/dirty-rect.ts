import type { Bounds, ElementId } from "@oh-just-another/types";
import { bounds as B } from "@oh-just-another/math";
import {
  getElementRenderBounds,
  getElementWorldBounds,
  type Link,
  type Scene,
} from "@oh-just-another/scene";
import { computeLinkWorldBounds } from "@oh-just-another/renderer-core";

/** Per-element before/after render bounds for the tile-cache invalidation pass. */
export interface TileDirtyEntry {
  readonly before: Bounds | null;
  readonly after: Bounds | null;
}

/** Result of {@link computeSceneDirtyRect}. */
export interface SceneDirtyRect {
  /** World dirty rect, or the empty off-screen sentinel when nothing changed. */
  readonly world: Bounds;
  /** Changed-element render bounds (before/after) for the tile-cache path. */
  readonly tileDirty: ReadonlyMap<ElementId, TileDirtyEntry>;
}

/**
 * Empty off-screen rect: renderScene's dirty filter culls every shape against
 * it, making the main pass a no-op.
 */
const EMPTY_DIRTY: Bounds = { x: -1e9, y: -1e9, width: 0, height: 0 };

/** World-space inflation to cover anti-aliased stroke fuzz around edges. */
const DIRTY_INFLATE_PX = 4;

/**
 * Diff two scenes into the world rect that needs repainting, plus per-element
 * before/after render bounds for tile-cache invalidation. Pure in the two
 * scenes — the caller applies the gesture / viewport / layer guards before
 * calling this and decides whether to use `tileDirty`. Returns the empty
 * off-screen rect when nothing changed.
 */
export const computeSceneDirtyRect = (prev: Scene, next: Scene): SceneDirtyRect => {
  const tileDirty = new Map<ElementId, TileDirtyEntry>();
  if (prev === next) return { world: EMPTY_DIRTY, tileDirty };

  let acc: Bounds | null = null;
  const add = (b: Bounds): void => {
    acc = acc ? B.union(acc, b) : b;
  };

  // Track shapes that changed (added / removed / mutated). Links attached to
  // any of these have stale rendered paths even when the edge object itself is
  // reference-equal — the path resolves through the shape's new position, but
  // the old path stays on screen as a "ghost" trail unless invalidated.
  const changedElementIds = new Set<ElementId>();
  for (const [id, shape] of next.elements) {
    const old = prev.elements.get(id);
    if (old === shape) continue;
    changedElementIds.add(id);
    // Render bounds (not geometric) so overpaint — a frame's header strip,
    // confetti particles — is cleared too, no ghost trail.
    const afterBounds = getElementRenderBounds(shape);
    const beforeBounds = old ? getElementRenderBounds(old) : null;
    add(afterBounds);
    if (beforeBounds) add(beforeBounds);
    // before/after pair covers add + move; pure mutation re-uses afterBounds.
    tileDirty.set(id, { before: beforeBounds, after: afterBounds });
  }
  for (const [id, shape] of prev.elements) {
    if (!next.elements.has(id)) {
      changedElementIds.add(id);
      // Render bounds so a removed frame / confetti clears its overpaint.
      const beforeBounds = getElementRenderBounds(shape);
      add(beforeBounds);
      tileDirty.set(id, { before: beforeBounds, after: null });
    }
  }

  const linkTouchesChangedElement = (edge: Link): boolean => {
    for (const ep of [edge.from, edge.to]) {
      if (ep.kind !== "point" && changedElementIds.has(ep.elementId)) return true;
    }
    return false;
  };
  for (const [id, edge] of next.links) {
    const old = prev.links.get(id);
    // Refresh edge dirty-rect when the edge object changed, OR an endpoint
    // references a shape that moved this frame (path re-resolves every render
    // but the old screen pixels persist).
    if (old === edge && !linkTouchesChangedElement(edge)) continue;
    const b = computeLinkWorldBounds(next, edge);
    if (b) add(b);
    const oldLink = old ?? edge; // prev scene resolves with prev shapes for ghost-clear
    const ob = computeLinkWorldBounds(prev, oldLink);
    if (ob) add(ob);
  }
  for (const [id, edge] of prev.links) {
    if (!next.links.has(id)) {
      const b = computeLinkWorldBounds(prev, edge);
      if (b) add(b);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `acc` is mutated via the `add` closure; TS flow analysis can't see it and narrows to null
  if (acc === null) return { world: EMPTY_DIRTY, tileDirty };

  // Transitive expansion: any shape whose bounds intersect the dirty rect must
  // be repainted, AND its bounds added so a shape ABOVE it that overlaps gets
  // included too. Repeat until the set stabilises — otherwise dragging A
  // through a B/C stack lets C (above B, partially overlapping) re-emerge.
  const visited = new Set<ElementId>();
  let expanded: Bounds = acc;
  let grew = true;
  while (grew) {
    grew = false;
    for (const shape of next.elements.values()) {
      if (visited.has(shape.id)) continue;
      const bb = getElementWorldBounds(shape);
      if (!B.intersects(bb, expanded)) continue;
      visited.add(shape.id);
      const merged = B.union(expanded, bb);
      if (
        merged.x !== expanded.x ||
        merged.y !== expanded.y ||
        merged.width !== expanded.width ||
        merged.height !== expanded.height
      ) {
        expanded = merged;
        grew = true;
      }
    }
  }
  return { world: B.expand(expanded, DIRTY_INFLATE_PX), tileDirty };
};
