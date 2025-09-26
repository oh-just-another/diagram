import type { AnnotationId, LinkId, FileId, LayerId, ElementId } from "@oh-just-another/types";
import type { Annotation } from "./annotation.js";
import type { Edge } from "./edge.js";
import type { BinaryFile } from "./file.js";
import type { Layer } from "./layer.js";
import type { Element } from "./shape.js";
import type { Viewport } from "./viewport.js";

/**
 * Unified patch model: each entity update carries `before` and `after`.
 *   `before === null && after !== null`  → add
 *   `before !== null && after === null`  → remove
 *   `before !== null && after !== null`  → update (or move)
 *
 * `before` is stored so `invert` is a pure swap with no need to read the
 * surrounding scene. This is what makes history and offline CRDT replay
 * symmetric and cheap.
 */
export type Patch =
  | {
      readonly kind: "shape";
      readonly id: ElementId;
      readonly before: Element | null;
      readonly after: Element | null;
    }
  | {
      readonly kind: "edge";
      readonly id: LinkId;
      readonly before: Edge | null;
      readonly after: Edge | null;
    }
  | {
      readonly kind: "layer";
      readonly id: LayerId;
      readonly before: Layer | null;
      readonly after: Layer | null;
    }
  | {
      readonly kind: "annotation";
      readonly id: AnnotationId;
      readonly before: Annotation | null;
      readonly after: Annotation | null;
    }
  | { readonly kind: "viewport"; readonly before: Viewport; readonly after: Viewport }
  | {
      readonly kind: "file";
      readonly id: FileId;
      readonly before: BinaryFile | null;
      readonly after: BinaryFile | null;
    }
  | { readonly kind: "batch"; readonly patches: readonly Patch[] };

/** Swap `before` and `after` recursively. */
export const invert = (patch: Patch): Patch => {
  switch (patch.kind) {
    case "shape":
      return { kind: "shape", id: patch.id, before: patch.after, after: patch.before };
    case "edge":
      return { kind: "edge", id: patch.id, before: patch.after, after: patch.before };
    case "layer":
      return { kind: "layer", id: patch.id, before: patch.after, after: patch.before };
    case "annotation":
      return { kind: "annotation", id: patch.id, before: patch.after, after: patch.before };
    case "viewport":
      return { kind: "viewport", before: patch.after, after: patch.before };
    case "file":
      return { kind: "file", id: patch.id, before: patch.after, after: patch.before };
    case "batch":
      // Reverse order so undoing a batch unwinds it in LIFO.
      return { kind: "batch", patches: patch.patches.map(invert).reverse() };
  }
};

/** Compose patches into a single atomic unit. Flattens nested batches. */
export const batch = (patches: readonly Patch[]): Patch => {
  const flat: Patch[] = [];
  for (const p of patches) {
    if (p.kind === "batch") flat.push(...p.patches);
    else flat.push(p);
  }
  return { kind: "batch", patches: flat };
};

/** True when applying the patch would not change the scene. */
export const isNoop = (patch: Patch): boolean => {
  switch (patch.kind) {
    case "shape":
    case "edge":
    case "layer":
    case "annotation":
    case "file":
      return patch.before === patch.after;
    case "viewport":
      return patch.before === patch.after;
    case "batch":
      return patch.patches.length === 0 || patch.patches.every(isNoop);
  }
};
