import type { Bounds, LinkId, LayerId, ElementId, Vec2 } from "@oh-just-another/types";
import { bounds as B } from "@oh-just-another/math";
import type { Link } from "./edge.js";
import type { Layer } from "./layer.js";
import type { Scene } from "./scene.js";
import { getElementWorldBounds, type Element } from "./shape.js";
import { SpatialGrid } from "./spatial.js";

// --- direct lookups ---

export const getElement = (scene: Scene, id: ElementId): Element | undefined => scene.elements.get(id);

export const getLink = (scene: Scene, id: LinkId): Link | undefined => scene.links.get(id);

export const getLayer = (scene: Scene, id: LayerId): Layer | undefined => scene.layers.get(id);

// --- iteration in z-order ---

/**
 * Layers sorted bottom-to-top by their `order` field. Stable for equal orders
 * (which should not happen in practice with fractional indices).
 */
export const getLayersInOrder = (scene: Scene): readonly Layer[] =>
  [...scene.layers.values()].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

/** Shapes in `layerId`, sorted bottom-to-top by `order`. */
export const getElementsInLayer = (scene: Scene, layerId: LayerId): readonly Element[] =>
  [...scene.elements.values()]
    .filter((s) => s.layerId === layerId)
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

export const getLinksInLayer = (scene: Scene, layerId: LayerId): readonly Link[] =>
  [...scene.links.values()]
    .filter((e) => e.layerId === layerId)
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

// --- group queries (parentId chain) ---

/**
 * Direct children of `parentId` — every shape whose `parentId` equals
 * the argument, in z-order. Linear in scene size; for groups inside the
 * editor's hot path, cache the result by `(scene, parentId)`.
 */
export const getChildrenOf = (scene: Scene, parentId: ElementId): readonly Element[] => {
  const out: Element[] = [];
  for (const s of scene.elements.values()) {
    if (s.parentId === parentId) out.push(s);
  }
  out.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  return out;
};

/**
 * `true` when the shape (or any of its ancestors via `parentId`) has
 * `locked: true`. Walks the parent chain bounded by
 * `MAX_PARENT_DEPTH` so the answer stays O(depth) for a freshly
 * grouped scene. Independent from `Layer.locked` — callers that need
 * the combined interactivity gate should `||` both flags.
 */
export const isElementLocked = (scene: Scene, shape: Element): boolean => {
  let current: Element | undefined = shape;
  for (let i = 0; current && i < MAX_PARENT_DEPTH; i++) {
    if (current.locked === true) return true;
    if (!current.parentId) return false;
    current = scene.elements.get(current.parentId);
  }
  return false;
};

/**
 * `true` when the shape (or any of its ancestors via `parentId`) has
 * `hidden: true`. Same propagation semantics as `isElementLocked`.
 */
export const isElementHidden = (scene: Scene, shape: Element): boolean => {
  let current: Element | undefined = shape;
  for (let i = 0; current && i < MAX_PARENT_DEPTH; i++) {
    if (current.hidden === true) return true;
    if (!current.parentId) return false;
    current = scene.elements.get(current.parentId);
  }
  return false;
};

/**
 * Walks the `parentId` chain starting from `elementId` and returns the
 * topmost ancestor (the root). Returns the shape itself when it has no
 * parent, or `undefined` when the shape (or any ancestor) is missing.
 * Cycle-safe — bails after `MAX_PARENT_DEPTH` hops.
 */
export const getRootSelf = (scene: Scene, elementId: ElementId): Element | undefined => {
  let current = scene.elements.get(elementId);
  for (let i = 0; current?.parentId && i < MAX_PARENT_DEPTH; i++) {
    const parent = scene.elements.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current;
};

/**
 * Every descendant of `parentId`, recursive, including the root itself.
 * Order: parent first, then a depth-first walk. Cycle-safe via the
 * `visited` set.
 */
export const getDescendantsOf = (scene: Scene, parentId: ElementId): readonly Element[] => {
  const root = scene.elements.get(parentId);
  if (!root) return [];
  const visited = new Set<ElementId>([parentId]);
  const out: Element[] = [root];
  const stack: ElementId[] = [parentId];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur === undefined) break;
    for (const child of getChildrenOf(scene, cur)) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      out.push(child);
      stack.push(child.id);
    }
  }
  return out;
};

const MAX_PARENT_DEPTH = 64;

// --- spatial queries (linear scan) ---

/**
 * Shapes whose world AABB intersects `range`. Linear in the number of shapes.
 * For large scenes use `buildSpatialIndex` once and query the index.
 */
export const getElementsInBounds = (scene: Scene, range: Bounds): readonly Element[] => {
  const out: Element[] = [];
  for (const s of scene.elements.values()) {
    if (B.intersects(getElementWorldBounds(s), range)) out.push(s);
  }
  return out;
};

/**
 * Shapes whose world-AABB is at least `minCoverageRatio` covered by
 * `range`. `1` requires full containment (containment-style lasso);
 * `0.5` selects when at least half of the element sits inside the
 * box — friendlier than pure intersection because brushing past an
 * edge doesn't accidentally grab the shape.
 *
 * Always selects shapes that fully contain the lasso (small lasso
 * inside a big shape) — same affordance as bidirectional containment.
 * Zero-area shapes (groups, brushes-with-one-vertex) fall back to a
 * plain intersection test.
 */
export const getElementsCoveredByBounds = (
  scene: Scene,
  range: Bounds,
  minCoverageRatio = 0.5,
): readonly Element[] => {
  const out: Element[] = [];
  for (const s of scene.elements.values()) {
    const b = getElementWorldBounds(s);
    if (!B.intersects(b, range)) continue;
    const area = b.width * b.height;
    if (area <= 0) {
      out.push(s);
      continue;
    }
    const ix = Math.max(b.x, range.x);
    const iy = Math.max(b.y, range.y);
    const ix2 = Math.min(b.x + b.width, range.x + range.width);
    const iy2 = Math.min(b.y + b.height, range.y + range.height);
    const iw = ix2 - ix;
    const ih = iy2 - iy;
    if (iw <= 0 || ih <= 0) continue;
    const coverage = (iw * ih) / area;
    if (coverage >= minCoverageRatio) {
      out.push(s);
      continue;
    }
    // Bidirectional: tiny lasso inside a big shape still picks it.
    const lassoArea = range.width * range.height;
    if (lassoArea > 0 && (iw * ih) / lassoArea >= minCoverageRatio) {
      out.push(s);
    }
  }
  return out;
};

/**
 * Topmost shape containing `point`. Iterates layers top-to-bottom, then shapes
 * within each layer top-to-bottom; returns the first hit. Hit-test here is the
 * conservative AABB test; renderer-specific shape-precise hit-tests belong
 * with the renderer.
 */
export const getElementAt = (scene: Scene, point: Vec2): Element | undefined => {
  const layers = getLayersInOrder(scene);
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer?.visible) continue;
    const shapes = getElementsInLayer(scene, layer.id);
    for (let j = shapes.length - 1; j >= 0; j--) {
      const s = shapes[j];
      if (s === undefined) continue;
      if (B.contains(getElementWorldBounds(s), point)) return s;
    }
  }
  return undefined;
};

// --- spatial index helpers ---

/**
 * Build a `SpatialGrid` from the current scene. Re-build (or update
 * incrementally) when shapes change — the grid is not auto-synced with the
 * scene. The default cell size is tuned for typical editor scenes; pass an
 * explicit value if your shapes are much larger or smaller.
 */
export const buildSpatialIndex = (scene: Scene, cellSize?: number): SpatialGrid => {
  const grid = new SpatialGrid(cellSize);
  for (const shape of scene.elements.values()) {
    grid.insert(shape.id, getElementWorldBounds(shape));
  }
  return grid;
};

/**
 * Range query backed by the index. Returns shapes (not just ids) whose AABB
 * actually intersects `range`. The grid pre-filters by cell overlap; this
 * function does the precise AABB filter.
 */
export const queryByIndex = (scene: Scene, grid: SpatialGrid, range: Bounds): readonly Element[] => {
  const candidates = grid.query(range);
  const out: Element[] = [];
  for (const id of candidates) {
    const shape = scene.elements.get(id);
    if (!shape) continue;
    if (B.intersects(getElementWorldBounds(shape), range)) out.push(shape);
  }
  return out;
};

/**
 * Point hit-test backed by a SpatialGrid. Equivalent to `getElementAt` but
 * pre-filters candidates through `grid.query` — O(k) where k is the
 * shapes overlapping the point's cell. Walks layers top-to-bottom for
 * stable z-order; within a layer picks the highest-`order` shape that
 * actually contains the point.
 */
export const getElementAtIndexed = (
  scene: Scene,
  grid: SpatialGrid,
  point: Vec2,
): Element | undefined => {
  const pointRange: Bounds = { x: point.x, y: point.y, width: 0, height: 0 };
  const candidates = grid.query(pointRange);
  if (candidates.size === 0) return undefined;
  let best: Element | undefined;
  let bestLayerOrder = "";
  let bestElementOrder = "";
  let bestSet = false;
  for (const id of candidates) {
    const shape = scene.elements.get(id);
    if (!shape) continue;
    if (!B.contains(getElementWorldBounds(shape), point)) continue;
    const layer = scene.layers.get(shape.layerId);
    if (!layer?.visible) continue;
    const layerOrder = layer.order as string;
    if (
      !bestSet ||
      layerOrder > bestLayerOrder ||
      (layerOrder === bestLayerOrder && shape.order > bestElementOrder)
    ) {
      best = shape;
      bestLayerOrder = layerOrder;
      bestElementOrder = shape.order;
      bestSet = true;
    }
  }
  return best;
};
