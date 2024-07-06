import type { EdgeId, LayerId, ShapeId, Vec2 } from "@oh-just-another/types";
import type { FractionalIndex } from "fractional-keys";
import type { Style } from "./style";

/**
 * Standard named connection points. Renderers and templates own the mapping
 * from name to local coordinate. Custom labels are allowed — see `NamedAnchor`.
 */
export type StandardAnchor = "top" | "right" | "bottom" | "left" | "center";

/**
 * Named connection point on a shape. Either one of the well-known
 * `StandardAnchor` values or any custom label registered on the shape.
 * The `string & {}` form keeps autocomplete for the standard names while
 * still accepting arbitrary strings.
 */
export type NamedAnchor = StandardAnchor | (string & {});

export type AnchorRef =
  | { readonly kind: "named"; readonly name: NamedAnchor }
  /** Local-space offset inside the shape's bounding box (0..1 each axis). */
  | { readonly kind: "ratio"; readonly position: Vec2 };

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
