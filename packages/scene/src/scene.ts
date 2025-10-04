import {
  layerId as castLayerId,
  type AnnotationId,
  type LinkId,
  type FileId,
  type LayerId,
  type ElementId,
} from "@oh-just-another/types";
import { generateKeyBetween, generateNKeysBetween, type FractionalIndex } from "fractional-keys";
import type { Annotation } from "./annotation.js";
import type { Link } from "./edge.js";
import type { BinaryFile } from "./file.js";
import { type Layer } from "./layer.js";
import type { Patch } from "./patch.js";
import type { Element } from "./shape.js";
import { DEFAULT_VIEWPORT, type Viewport } from "./viewport.js";

/**
 * Whole-scene container. Entities are stored in immutable `ReadonlyMap`s for
 * O(1) lookup; z-order is computed by sorting on the `order` field. The maps
 * are replaced wholesale on every operation, but only the touched entries are
 * actually reallocated (structural sharing).
 */
export interface Scene {
  readonly shapes: ReadonlyMap<ElementId, Element>;
  readonly edges: ReadonlyMap<LinkId, Link>;
  readonly layers: ReadonlyMap<LayerId, Layer>;
  /**
   * Threaded comments anchored to either a shape (id) or a free
   * world-space position. Separate from shapes/edges because they
   * are not part of the diagram's structure — they're meta-content
   * that hosts may toggle on/off without affecting render output.
   */
  readonly annotations: ReadonlyMap<AnnotationId, Annotation>;
  /**
   * Binary file registry. Shapes that carry bitmaps —
   * `ImageElement.fileId` is the typical case — reference entries
   * here instead of embedding `src` as a dataURL. Keeps the
   * shape-graph small (so scene.json stays human-grep-able) and
   * lets the host transport the bytes once, regardless of how
   * many shapes reference them.
   *
   * Optional (defaults to empty) so scenes without file entries
   * keep loading: `ImageElement.src` remains the fallback when
   * `fileId` is unset.
   */
  readonly files: ReadonlyMap<FileId, BinaryFile>;
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
  files: new Map(),
  viewport: DEFAULT_VIEWPORT,
});

/**
 * Idempotent add: writes the file under its id, replacing any
 * previous entry with the same id. Returns a fresh Scene with
 * the new `files` map. Pure.
 */
export const addBinaryFile = (scene: Scene, file: BinaryFile): Scene => {
  const files = new Map(scene.files);
  files.set(file.id, file);
  return { ...scene, files };
};

/**
 * Remove a binary file by id. No-op when the id isn't present.
 * Doesn't garbage-collect references — callers that delete shapes
 * pointing at the file should remove the file separately when
 * they're certain no other shape still references it.
 */
export const removeBinaryFile = (scene: Scene, id: FileId): Scene => {
  if (!scene.files.has(id)) return scene;
  const files = new Map(scene.files);
  files.delete(id);
  return { ...scene, files };
};

/** Lookup helper — mirrors `getElement` / `getLink` style. */
export const getBinaryFile = (scene: Scene, id: FileId): BinaryFile | undefined =>
  scene.files.get(id);

/** Apply a patch to a scene, returning a new scene. Pure. */
export const apply = (scene: Scene, patch: Patch): Scene => {
  switch (patch.kind) {
    case "element": {
      const shapes = new Map(scene.shapes);
      if (patch.after === null) shapes.delete(patch.id);
      else shapes.set(patch.id, patch.after);
      return { ...scene, shapes };
    }
    case "link": {
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
    case "file": {
      const files = new Map(scene.files);
      if (patch.after === null) files.delete(patch.id);
      else files.set(patch.id, patch.after);
      return { ...scene, files };
    }
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

/**
 * Generate `n` evenly-spaced fractional indices strictly between `a` and
 * `b`. Useful for compaction passes that rewrite a whole layer's
 * z-order back to short balanced strings (`"a0"`, `"a1"`, `"a2"`, …)
 * after a burst of insert-in-the-middle operations has lengthened the
 * existing keys.
 */
export const orderBetweenMany = (
  a: FractionalIndex | null,
  b: FractionalIndex | null,
  n: number,
): readonly FractionalIndex[] => generateNKeysBetween(a, b, n);
