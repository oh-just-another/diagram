import type { Vec2 } from "@oh-just-another/types";
import type { Annotation } from "./annotation.js";
import type { Scene } from "./scene.js";
import { getShape } from "./queries.js";

/**
 * World-space position where the pin should render. When the annotation
 * is anchored to a shape, the stored `position` is added to the shape's
 * world position (so the pin follows shape moves). When the shape is
 * gone — or the annotation is a free-floater — `position` is used as-is.
 */
export const getAnnotationWorldPosition = (scene: Scene, annotation: Annotation): Vec2 => {
  if (annotation.shapeId === null) return annotation.position;
  const shape = getShape(scene, annotation.shapeId);
  if (!shape) return annotation.position;
  return {
    x: shape.position.x + annotation.position.x,
    y: shape.position.y + annotation.position.y,
  };
};
