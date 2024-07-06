import type { EdgeId, LayerId, ShapeId, Vec2 } from "@oh-just-another/types";
import type { Edge } from "./edge";
import type { Layer } from "./layer";
import type { Patch } from "./patch";
import { apply, type Scene } from "./scene";
import type { Shape } from "./shape";
import type { Viewport } from "./viewport";

/**
 * Every mutating operation returns the pair `{ scene, patch }`. The patch is
 * what history / collab persist; applying `invert(patch)` to the result returns
 * exactly the input scene.
 */
export interface OperationResult {
  readonly scene: Scene;
  readonly patch: Patch;
}

// --- Shapes ---

export const addShape = (scene: Scene, shape: Shape): OperationResult => {
  if (scene.shapes.has(shape.id)) {
    throw new Error(`Shape already exists: ${shape.id}`);
  }
  const patch: Patch = { kind: "shape", id: shape.id, before: null, after: shape };
  return { scene: apply(scene, patch), patch };
};

export const removeShape = (scene: Scene, id: ShapeId): OperationResult => {
  const before = scene.shapes.get(id);
  if (!before) throw new Error(`Shape not found: ${id}`);
  const patch: Patch = { kind: "shape", id, before, after: null };
  return { scene: apply(scene, patch), patch };
};

export const updateShape = (
  scene: Scene,
  id: ShapeId,
  update: (shape: Shape) => Shape,
): OperationResult => {
  const before = scene.shapes.get(id);
  if (!before) throw new Error(`Shape not found: ${id}`);
  const after = update(before);
  const patch: Patch = { kind: "shape", id, before, after };
  return { scene: apply(scene, patch), patch };
};

export const moveShape = (scene: Scene, id: ShapeId, to: Vec2): OperationResult =>
  updateShape(scene, id, (s) => ({ ...s, position: to }));

// --- Edges ---

export const addEdge = (scene: Scene, edge: Edge): OperationResult => {
  if (scene.edges.has(edge.id)) {
    throw new Error(`Edge already exists: ${edge.id}`);
  }
  const patch: Patch = { kind: "edge", id: edge.id, before: null, after: edge };
  return { scene: apply(scene, patch), patch };
};

export const removeEdge = (scene: Scene, id: EdgeId): OperationResult => {
  const before = scene.edges.get(id);
  if (!before) throw new Error(`Edge not found: ${id}`);
  const patch: Patch = { kind: "edge", id, before, after: null };
  return { scene: apply(scene, patch), patch };
};

export const updateEdge = (
  scene: Scene,
  id: EdgeId,
  update: (edge: Edge) => Edge,
): OperationResult => {
  const before = scene.edges.get(id);
  if (!before) throw new Error(`Edge not found: ${id}`);
  const after = update(before);
  const patch: Patch = { kind: "edge", id, before, after };
  return { scene: apply(scene, patch), patch };
};

// --- Layers ---

export const addLayer = (scene: Scene, layer: Layer): OperationResult => {
  if (scene.layers.has(layer.id)) {
    throw new Error(`Layer already exists: ${layer.id}`);
  }
  const patch: Patch = { kind: "layer", id: layer.id, before: null, after: layer };
  return { scene: apply(scene, patch), patch };
};

export const removeLayer = (scene: Scene, id: LayerId): OperationResult => {
  const before = scene.layers.get(id);
  if (!before) throw new Error(`Layer not found: ${id}`);
  const patch: Patch = { kind: "layer", id, before, after: null };
  return { scene: apply(scene, patch), patch };
};

export const updateLayer = (
  scene: Scene,
  id: LayerId,
  update: (layer: Layer) => Layer,
): OperationResult => {
  const before = scene.layers.get(id);
  if (!before) throw new Error(`Layer not found: ${id}`);
  const after = update(before);
  const patch: Patch = { kind: "layer", id, before, after };
  return { scene: apply(scene, patch), patch };
};

// --- Viewport ---

export const setViewport = (scene: Scene, viewport: Viewport): OperationResult => {
  const patch: Patch = { kind: "viewport", before: scene.viewport, after: viewport };
  return { scene: apply(scene, patch), patch };
};
