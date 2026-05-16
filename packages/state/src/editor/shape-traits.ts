import type { Element, ElementBase } from "@oh-just-another/scene";
import { ALL_HANDLES, type HandleId } from "../handle.js";

/**
 * True when the shape's geometry is parametrised by `width` / `height` fields
 * the editor can rewrite directly during a resize. Anything else (paths,
 * polygons, brush strokes, text, groups) has to ride the `scale` multiplier
 * instead.
 */
export const hasWidthHeight = (s: Element): s is Element & { width: number; height: number } =>
  s.type === "rectangle" ||
  s.type === "ellipse" ||
  s.type === "image" ||
  s.type === "template" ||
  s.type === "frame";

/**
 * Element types that expose interactive resize handles (single-selection
 * chrome + handle hit-test). Lives in this neutral traits module so the
 * selection overlay, the hit-test, and the debug hit-zone viz share one
 * predicate without importing each other.
 */
const RESIZABLE_TYPES: ReadonlySet<string> = new Set([
  "rectangle",
  "ellipse",
  "template",
  "text",
  "frame",
]);

export const isResizable = (shape: ElementBase): boolean => RESIZABLE_TYPES.has(shape.type);

/** Which handles a resizable shape offers. All 8 for every type. */
export const resizeHandlesFor = (_shape: ElementBase): readonly HandleId[] => ALL_HANDLES;
