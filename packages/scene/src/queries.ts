import type { Bounds, EdgeId, LayerId, ShapeId, Vec2 } from "@oh-just-another/types";
import { bounds as B } from "@oh-just-another/math";
import type { Edge } from "./edge";
import type { Layer } from "./layer";
import type { Scene } from "./scene";
import { getShapeWorldBounds, type Shape } from "./shape";
import { SpatialGrid } from "./spatial";

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
