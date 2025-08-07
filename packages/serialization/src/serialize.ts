import type { Scene } from "@oh-just-another/scene";
import { CURRENT_VERSION, type SceneDocument } from "./schema.js";

/**
 * Convert an in-memory `Scene` into a plain JSON-ready document. The result is
 * deterministic for a given scene — Map iteration order follows insertion
 * order and is not sorted.
 *
 * Pure: doesn't read or write any global state.
 */
export const serializeScene = (scene: Scene): SceneDocument => {
  const annotations =
    scene.annotations.size > 0
      ? ([...scene.annotations.values()] as unknown as NonNullable<SceneDocument["annotations"]>)
      : undefined;
  const doc: SceneDocument = {
    format: "oh-just-another/scene",
    version: CURRENT_VERSION,
    shapes: [...scene.shapes.values()].map(stripTransientMetadata) as SceneDocument["shapes"],
    edges: [...scene.edges.values()] as SceneDocument["edges"],
    layers: [...scene.layers.values()],
    viewport: scene.viewport,
  };
  // Omit `annotations` for empty collections.
  if (annotations) doc.annotations = annotations;
  return doc;
};

/**
 * Drop transient, non-JSON-able fields from `shape.metadata` before
 * serialisation. `metadata.image` holds a live `<img>` / `<video>` DOM element
 * (attached by the image file-drop handler so the renderer can `drawImage` it
 * directly); `JSON.stringify` would turn it into an empty object that throws
 * inside `ctx.drawImage` / `gl.texImage2D` on reload. On reload the renderer
 * falls back to `src` / `fileId`.
 *
 * `animationData` holds the raw GIF `ArrayBuffer`; the bytes live in
 * `Scene.files` (via `fileId`) and the editor rehydrates animationData from
 * there on load.
 *
 * Returns the shape unchanged when there's nothing transient to drop, so
 * non-image shapes pay no allocation.
 */
const stripTransientMetadata = <T extends { metadata?: Record<string, unknown> }>(shape: T): T => {
  const md = shape.metadata;
  if (!md || !("image" in md)) return shape;
  const { image: _image, ...rest } = md;
  void _image;
  const next = { ...shape } as T & { metadata?: Record<string, unknown> };
  if (Object.keys(rest).length > 0) next.metadata = rest;
  else delete next.metadata;
  return next;
};

/**
 * Stringify a scene. Convenience for `JSON.stringify(serializeScene(s))` with
 * optional 2-space indent for human-readable output.
 */
export const stringifyScene = (scene: Scene, indent: number | null = null): string =>
  JSON.stringify(serializeScene(scene), null, indent ?? undefined);
