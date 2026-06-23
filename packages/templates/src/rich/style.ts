import type { Color, Vec2 } from "@oh-just-another/types";
import type { TextAlign } from "@oh-just-another/scene";

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
  readonly textAlign?: TextAlign;
  readonly textBaseline?: "top" | "middle" | "bottom";
}

/**
 * Spacing for `padding` / `margin`. Accepts a number (uniform) or a
 * `{ top, right, bottom, left }` object.
 */
export type Spacing = number | LinkSpacing;

export interface LinkSpacing {
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
export type Position = "relative" | "absolute" | "spot";

/**
 * Anchor reference inside a parent's bounding box (or on a child for
 * `anchorFocus`). Either one of the 9 standard spots or a custom
 * `{ratio: {x: 0..1, y: 0..1}}` inside the box.
 *
 * Mirrors the `StandardAnchor` set in `@scene` so anchor names round-trip
 * cleanly between rich templates and edge endpoints.
 */
export type SpotName =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left"
  | "center";

export type SpotRef = SpotName | { readonly ratio: Vec2 };

const SPOT_RATIOS: Readonly<Record<SpotName, Vec2>> = {
  "top-left": { x: 0, y: 0 },
  top: { x: 0.5, y: 0 },
  "top-right": { x: 1, y: 0 },
  right: { x: 1, y: 0.5 },
  "bottom-right": { x: 1, y: 1 },
  bottom: { x: 0.5, y: 1 },
  "bottom-left": { x: 0, y: 1 },
  left: { x: 0, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
};

/**
 * Convert a `SpotRef` into a `{x, y}` ratio (0..1 each axis). Mirrors
 * `STANDARD_ANCHOR_RATIOS` in `@scene` — keep the two in sync if you ever
 * add new named spots.
 */
export const resolveSpotRatio = (ref: SpotRef): Vec2 => {
  if (typeof ref === "string") return SPOT_RATIOS[ref];
  return ref.ratio;
};

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
   *
   * `"spot"` positions the node by pinning one of its anchor points
   * (`anchorFocus`) to one of the parent's anchor points (`anchor`),
   * then applies `offset` in local pixels. Useful for corner badges,
   * floating close buttons, overlay decorators — anything that should
   * track a specific position on the parent regardless of layout flow.
   */
  readonly position?: Position;
  readonly top?: number;
  readonly left?: number;
  readonly right?: number;
  readonly bottom?: number;

  /** Spot-only: anchor point on the *parent's* content box. Default `"center"`. */
  readonly anchor?: SpotRef;
  /** Spot-only: anchor point on the *child* (where to pin against parent's anchor). Default `"center"`. */
  readonly anchorFocus?: SpotRef;
  /** Spot-only: pixel offset applied after spot resolution. */
  readonly offset?: Vec2;
}
