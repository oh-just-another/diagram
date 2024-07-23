import type { Color } from "@oh-just-another/types";

/**
 * Visual style of a single rich-template node. Mirrors a useful subset of CSS
 * properties — every field is optional so the underlying renderer falls back
 * to its own defaults when nothing is set.
 */
export interface NodeStyle {
  readonly fill?: Color;
  readonly stroke?: Color;
  readonly strokeWidth?: number;
  readonly borderRadius?: number;
  readonly opacity?: number;
  /** Default text colour for `Text` nodes that don't set their own. */
  readonly color?: Color;
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontWeight?: "normal" | "bold" | number;
  readonly textAlign?: "left" | "center" | "right";
  readonly textBaseline?: "top" | "middle" | "bottom";
}

/**
 * Spacing for `padding` / `margin`. Accepts a number (uniform) or a
 * `{ top, right, bottom, left }` object.
 */
export type Spacing = number | EdgeSpacing;

export interface EdgeSpacing {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
}

/** Resolve `Spacing` into a strict 4-tuple of pixels. */
export const resolveSpacing = (
  s: Spacing | undefined,
): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} => {
  if (s === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof s === "number") return { top: s, right: s, bottom: s, left: s };
  return {
    top: s.top ?? 0,
    right: s.right ?? 0,
    bottom: s.bottom ?? 0,
    left: s.left ?? 0,
  };
};

export type FlexDirection = "row" | "column";
export type JustifyContent = "start" | "center" | "end" | "space-between" | "space-around";
export type AlignItems = "start" | "center" | "end" | "stretch" | "baseline";
export type FlexWrap = "nowrap" | "wrap";
export type Position = "relative" | "absolute";

/**
 * Sizing value: a number is pixels, `"auto"` means intrinsic / shrink-to-fit,
 * a percent string is relative to the parent's content box.
 */
export type Length = number | "auto" | `${number}%`;

/**
 * Layout properties on a node. Container nodes interpret the flex-* fields;
 * leaf nodes use the position/size/margin fields. Unknown nodes default to
 * `display: "flex"`, direction `"row"`.
 */
export interface LayoutStyle {
  /** Only `"flex"` is supported. */
  readonly display?: "flex";
  readonly flexDirection?: FlexDirection;
  readonly justifyContent?: JustifyContent;
  readonly alignItems?: AlignItems;
  /** Wrap children to a new line when they exceed the main axis. Default `"nowrap"`. */
  readonly flexWrap?: FlexWrap;
  /** Pixels between children along the main axis (also between wrapped lines). */
  readonly gap?: number;
  readonly padding?: Spacing;
  readonly margin?: Spacing;

  /** Flex-grow factor along the parent's main axis. */
  readonly flex?: number;
  /** Override align-items per-child. */
  readonly alignSelf?: AlignItems;

  readonly width?: Length;
  readonly height?: Length;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;

  /**
   * `"absolute"` takes the node out of the parent's flex flow and positions
   * it via `top/left/right/bottom` relative to the parent's *padding box*.
   * Mixing absolute and flex siblings is allowed.
   */
  readonly position?: Position;
  readonly top?: number;
  readonly left?: number;
  readonly right?: number;
  readonly bottom?: number;
}
