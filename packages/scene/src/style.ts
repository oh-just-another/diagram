import type { Color } from "@oh-just-another/types";

export type LineCap = "butt" | "round" | "square";
export type LineJoin = "miter" | "round" | "bevel";

/**
 * Visual style for shapes and edges. Every field is optional so that scenes,
 * patches and partial updates stay compact; renderers fall back to library
 * defaults when a field is omitted.
 */
export interface Style {
  readonly fill?: Color;
  readonly stroke?: Color;
  readonly strokeWidth?: number;
  readonly opacity?: number;
  readonly dashArray?: readonly number[];
  readonly lineCap?: LineCap;
  readonly lineJoin?: LineJoin;
}

export type TextAlign = "left" | "center" | "right";
export type TextBaseline = "top" | "middle" | "bottom";

/**
 * Text-specific style overlay. Inherits all `Style` fields (fill = text color,
 * stroke = outline). Layout metrics live on the `TextShape` itself, not here.
 */
export interface TextStyle extends Style {
  readonly textAlign?: TextAlign;
  readonly textBaseline?: TextBaseline;
}
