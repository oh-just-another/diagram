import type { EdgeId, LayerId, ShapeId, Vec2 } from "@oh-just-another/types";
import type { FractionalIndex } from "fractional-keys";
import type { Style } from "./style.js";

/**
 * Standard named connection points exposed by every shape — four corners,
 * four edge centres, and the geometric centre (9 total). See
 * `STANDARD_ANCHOR_RATIOS` in `./anchors.ts` for the bounds-relative
 * coordinates.
 *
 *   top-left ─── top ─── top-right
 *       │         │          │
 *      left ─── center ─── right
 *       │         │          │
 *  bottom-left ─ bottom ─ bottom-right
 */
export type StandardAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left"
  | "center";

/**
 * Named connection point on a shape. Either one of the well-known
 * `StandardAnchor` values or any custom label declared on the shape via
 * `ShapeBase.anchors`. The `string & {}` form keeps autocomplete for the
 * standard names while still accepting arbitrary strings.
 */
export type NamedAnchor = StandardAnchor | (string & {});

export type AnchorRef =
  | { readonly kind: "named"; readonly name: NamedAnchor }
  /** Local-space offset inside the shape's bounding box (0..1 each axis). */
  | { readonly kind: "ratio"; readonly position: Vec2 }
  /** Absolute pixel offset from the shape's local-bounds origin. */
  | { readonly kind: "absolute"; readonly offset: Vec2 };

export type EdgeEndpoint =
  | { readonly kind: "point"; readonly position: Vec2 }
  | { readonly kind: "anchor"; readonly shapeId: ShapeId; readonly anchor: AnchorRef };

/**
 * Connection between two endpoints, with optional waypoints for orthogonal /
 * routed lines. The kernel does not perform routing — that is up to the
 * renderer/layout pass.
 */
export interface Edge {
  readonly id: EdgeId;
  readonly layerId: LayerId;
  readonly from: EdgeEndpoint;
  readonly to: EdgeEndpoint;
  /** Intermediate waypoints in world coordinates. */
  readonly waypoints?: readonly Vec2[];
  /** Z-order key within `layerId`. */
  readonly order: FractionalIndex;
  readonly style: Style;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
