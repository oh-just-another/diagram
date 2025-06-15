import type { Shape } from "@oh-just-another/scene";

/**
 * True when the shape's geometry is parametrised by `width` / `height` fields
 * the editor can rewrite directly during a resize. Anything else (paths,
 * polygons, brush strokes, text, groups) has to ride the `scale` multiplier
 * instead.
 */
export const hasWidthHeight = (s: Shape): s is Shape & { width: number; height: number } =>
  s.type === "rectangle" ||
  s.type === "ellipse" ||
  s.type === "image" ||
  s.type === "template";
