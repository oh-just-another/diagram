import type { Bounds, EdgeId, LayerId, ShapeId, Vec2 } from "@oh-just-another/types";
import { bounds as B } from "@oh-just-another/math";
import type { Edge } from "./edge.js";
import type { Layer } from "./layer.js";
import type { Scene } from "./scene.js";
import { getShapeWorldBounds, type Shape } from "./shape.js";
import { SpatialGrid } from "./spatial.js";

// --- direct lookups ---

export const getShape = (scene: Scene, id: ShapeId): Shape | undefined => scene.shapes.get(id);

export const getEdge = (scene: Scene, id: EdgeId): Edge | undefined => scene.edges.get(id);

export const getLayer = (scene: Scene, id: LayerId): Layer | undefined => scene.layers.get(id);

// --- iteration in z-order ---

/**
 * Layers sorted bottom-to-top by their `order` field. Stable for equal orders
 * (which should not happen in practice with fractional indices).
 */
export const getLayersInOrder = (scene: Scene): readonly Layer[] =>
  [...scene.layers.values()].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

/** Shapes in `layerId`, sorted bottom-to-top by `order`. */
export const getShapesInLayer = (scene: Scene, layerId: LayerId): readonly Shape[] =>
  [...scene.shapes.values()]
    .filter((s) => s.layerId === layerId)
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

export const getEdgesInLayer = (scene: Scene, layerId: LayerId): readonly Edge[] =>
  [...scene.edges.values()]
    .filter((e) => e.layerId === layerId)
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

// --- group queries (parentId chain) ---

/**
 * Direct children of `parentId` — every shape whose `parentId` equals
 * the argument, in z-order. Linear in scene size; for groups inside the
 * editor's hot path, cache the result by `(scene, parentId)`.
 */
export const getChildrenOf = (scene: Scene, parentId: ShapeId): readonly Shape[] => {
  const out: Shape[] = [];
  for (const s of scene.shapes.values()) {
    if (s.parentId === parentId) out.push(s);
  }
  out.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  return out;
};

/**
 * Walks the `parentId` chain starting from `shapeId` and returns the
 * topmost ancestor (the root). Returns the shape itself when it has no
 * parent, or `undefined` when the shape (or any ancestor) is missing.
 * Cycle-safe — bails after `MAX_PARENT_DEPTH` hops.
 */
export const getRootSelf = (scene: Scene, shapeId: ShapeId): Shape | undefined => {
  let current = scene.shapes.get(shapeId);
  for (let i = 0; current && current.parentId && i < MAX_PARENT_DEPTH; i++) {
    const parent = scene.shapes.get(current.parentId);
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
export const getDescendantsOf = (scene: Scene, parentId: ShapeId): readonly Shape[] => {
  const root = scene.shapes.get(parentId);
  if (!root) return [];
  const visited = new Set<ShapeId>([parentId]);
  const out: Shape[] = [root];
  const stack: ShapeId[] = [parentId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
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
export const getShapesInBounds = (scene: Scene, range: Bounds): readonly Shape[] => {
  const out: Shape[] = [];
  for (const s of scene.shapes.values()) {
    if (B.intersects(getShapeWorldBounds(s), range)) out.push(s);
  }
  return out;
};

/**
 * Topmost shape containing `point`. Iterates layers top-to-bottom, then shapes
 * within each layer top-to-bottom; returns the first hit. Hit-test here is the
 * conservative AABB test; renderer-specific shape-precise hit-tests belong
 * with the renderer.
 */
export const getShapeAt = (scene: Scene, point: Vec2): Shape | undefined => {
  const layers = getLayersInOrder(scene);
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]!;
    if (!layer.visible) continue;
    const shapes = getShapesInLayer(scene, layer.id);
    for (let j = shapes.length - 1; j >= 0; j--) {
      const s = shapes[j]!;
      if (B.contains(getShapeWorldBounds(s), point)) return s;
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
  for (const shape of scene.shapes.values()) {
    grid.insert(shape.id, getShapeWorldBounds(shape));
  }
  return grid;
};

/**
 * Range query backed by the index. Returns shapes (not just ids) whose AABB
 * actually intersects `range`. The grid pre-filters by cell overlap; this
 * function does the precise AABB filter.
 */
export const queryByIndex = (scene: Scene, grid: SpatialGrid, range: Bounds): readonly Shape[] => {
  const candidates = grid.query(range);
  const out: Shape[] = [];
  for (const id of candidates) {
    const shape = scene.shapes.get(id);
    if (!shape) continue;
    if (B.intersects(getShapeWorldBounds(shape), range)) out.push(shape);
  }
  return out;
};

/**
 * Point hit-test backed by a SpatialGrid. Equivalent to `getShapeAt` but
 * pre-filters candidates through `grid.query` — O(k) where k is the
 * shapes overlapping the point's cell. Walks layers top-to-bottom for
 * stable z-order; within a layer picks the highest-`order` shape that
 * actually contains the point.
 */
export const getShapeAtIndexed = (
  scene: Scene,
  grid: SpatialGrid,
  point: Vec2,
): Shape | undefined => {
  const pointRange: Bounds = { x: point.x, y: point.y, width: 0, height: 0 };
  const candidates = grid.query(pointRange);
  if (candidates.size === 0) return undefined;
  let best: Shape | undefined;
  let bestLayerOrder = "";
  let bestShapeOrder = "";
  let bestSet = false;
  for (const id of candidates) {
    const shape = scene.shapes.get(id);
    if (!shape) continue;
    if (!B.contains(getShapeWorldBounds(shape), point)) continue;
    const layer = scene.layers.get(shape.layerId);
    if (!layer || !layer.visible) continue;
    const layerOrder = layer.order as string;
    if (
      !bestSet ||
      layerOrder > bestLayerOrder ||
      (layerOrder === bestLayerOrder && shape.order > bestShapeOrder)
    ) {
      best = shape;
      bestLayerOrder = layerOrder;
      bestShapeOrder = shape.order as string;
      bestSet = true;
    }
  }
  return best;
};
