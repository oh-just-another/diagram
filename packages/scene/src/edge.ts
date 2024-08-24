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
  | { readonly kind: "anchor"; readonly shapeId: ShapeId; readonly anchor: AnchorRef }
  /**
   * Pin the endpoint to a fraction along the shape's outline (0..1
   * clockwise from the bounds' top-left). Survives move / resize /
   * rotation — the renderer re-samples the outline every frame. Use this
   * when "near a specific edge but not on a port" is what the user
   * actually meant.
   */
  | { readonly kind: "outline"; readonly shapeId: ShapeId; readonly ratio: number };

/**
 * How to draw the line between an edge's two endpoints.
 *   - `straight` — single segment endpoint-to-endpoint.
 *   - `orthogonal` — Manhattan elbow (axis-aligned segments). The
 *     renderer picks intermediate waypoints; explicit `waypoints` on
 *     the edge override the default.
 *   - `bezier` — cubic curve. Renderer derives sensible control points
 *     from the endpoint directions.
 */
export type EdgeRouting = "straight" | "orthogonal" | "bezier";

/**
 * Decoration drawn at the end of an edge segment. Renderers map the
 * style to its own primitives (Canvas2D / SVG marker / pdfkit shape).
 */
export type ArrowheadStyle = "none" | "arrow" | "triangle" | "diamond" | "circle";

export interface EdgeArrowheads {
  readonly from?: ArrowheadStyle;
  readonly to?: ArrowheadStyle;
  /** Length of the arrowhead in local pixels. Default 10. */
  readonly size?: number;
}

/**
 * Inline text rendered along the edge. Position is the fractional offset
 * along the visible path (`0` = at `from`, `1` = at `to`, `0.5` = mid).
 * Renderers handle background pill / alignment.
 */
export interface EdgeLabel {
  readonly text: string;
  readonly position?: number; // 0..1, default 0.5
  readonly fontSize?: number; // default 12
  readonly fill?: string; // text colour, default #222
  readonly background?: string; // pill background, default #fff
}

/**
 * Connection between two endpoints, with optional waypoints for orthogonal /
 * routed lines. The kernel does not perform routing itself — that is up to
 * the renderer/layout pass, which reads `routing` + `waypoints` and either
 * follows them or computes new ones.
 */
export interface Edge {
  readonly id: EdgeId;
  readonly layerId: LayerId;
  readonly from: EdgeEndpoint;
  readonly to: EdgeEndpoint;
  /** Intermediate waypoints in world coordinates. */
  readonly waypoints?: readonly Vec2[];
  /** Routing strategy. Default `straight`. */
  readonly routing?: EdgeRouting;
  /** Arrowhead decoration on each end. Default: no arrowheads. */
  readonly arrowheads?: EdgeArrowheads;
  /** Optional inline label. */
  readonly label?: EdgeLabel;
  /** Z-order key within `layerId`. */
  readonly order: FractionalIndex;
  readonly style: Style;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
