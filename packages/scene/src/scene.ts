import {
  layerId as castLayerId,
  type AnnotationId,
  type EdgeId,
  type LayerId,
  type ShapeId,
} from "@oh-just-another/types";
import { generateKeyBetween, type FractionalIndex } from "fractional-keys";
import type { Annotation } from "./annotation.js";
import type { Edge } from "./edge.js";
import { type Layer } from "./layer.js";
import type { Patch } from "./patch.js";
import type { Shape } from "./shape.js";
import { DEFAULT_VIEWPORT, type Viewport } from "./viewport.js";

/**
 * Whole-scene container. Entities are stored in immutable `ReadonlyMap`s for
 * O(1) lookup; z-order is computed by sorting on the `order` field. The maps
 * are replaced wholesale on every operation, but only the touched entries are
 * actually reallocated (structural sharing).
 */
export interface Scene {
  readonly shapes: ReadonlyMap<ShapeId, Shape>;
  readonly edges: ReadonlyMap<EdgeId, Edge>;
  readonly layers: ReadonlyMap<LayerId, Layer>;
  /**
   * Threaded comments anchored to either a shape (id) or a free
   * world-space position. Separate from shapes/edges because they
   * are not part of the diagram's structure — they're meta-content
   * that hosts may toggle on/off without affecting render output.
   */
  readonly annotations: ReadonlyMap<AnnotationId, Annotation>;
  readonly viewport: Viewport;
}

export const DEFAULT_LAYER_ID: LayerId = castLayerId("default");

const defaultLayer = (): Layer => ({
  id: DEFAULT_LAYER_ID,
  name: "Default",
  visible: true,
  locked: false,
  order: generateKeyBetween(null, null),
});

/** Empty scene with a single default layer and a zero-size viewport. */
export const emptyScene = (): Scene => ({
  shapes: new Map(),
  edges: new Map(),
  layers: new Map([[DEFAULT_LAYER_ID, defaultLayer()]]),
  annotations: new Map(),
  viewport: DEFAULT_VIEWPORT,
});

/** Apply a patch to a scene, returning a new scene. Pure. */
export const apply = (scene: Scene, patch: Patch): Scene => {
  switch (patch.kind) {
    case "shape": {
      const shapes = new Map(scene.shapes);
      if (patch.after === null) shapes.delete(patch.id);
      else shapes.set(patch.id, patch.after);
      return { ...scene, shapes };
    }
    case "edge": {
      const edges = new Map(scene.edges);
      if (patch.after === null) edges.delete(patch.id);
      else edges.set(patch.id, patch.after);
      return { ...scene, edges };
    }
    case "layer": {
      const layers = new Map(scene.layers);
      if (patch.after === null) layers.delete(patch.id);
      else layers.set(patch.id, patch.after);
      return { ...scene, layers };
    }
    case "annotation": {
      const annotations = new Map(scene.annotations);
      if (patch.after === null) annotations.delete(patch.id);
      else annotations.set(patch.id, patch.after);
      return { ...scene, annotations };
    }
    case "viewport":
      return { ...scene, viewport: patch.after };
    case "batch":
      return patch.patches.reduce(apply, scene);
  }
};

// --- Fractional-index helpers ---

/**
 * Pick an `order` key that places the new entity above every existing one in
 * `layerId`. O(n) in the number of entities in that layer. For bulk inserts,
 * compute once and chain manually.
 */
export const orderForTop = (existing: Iterable<FractionalIndex>): FractionalIndex => {
  let highest: FractionalIndex | null = null;
  for (const order of existing) {
    if (highest === null || order > highest) highest = order;
  }
  return generateKeyBetween(highest, null);
};

/** Mirror of `orderForTop` for placing below everything. */
export const orderForBottom = (existing: Iterable<FractionalIndex>): FractionalIndex => {
  let lowest: FractionalIndex | null = null;
  for (const order of existing) {
    if (lowest === null || order < lowest) lowest = order;
  }
  return generateKeyBetween(null, lowest);
};

/** Pick an `order` that places strictly between two neighbors. */
export const orderBetween = (
  a: FractionalIndex | null,
  b: FractionalIndex | null,
): FractionalIndex => generateKeyBetween(a, b);
