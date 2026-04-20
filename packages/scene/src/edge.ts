import type { LinkId, LayerId, ElementId, Vec2 } from "@oh-just-another/types";
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
 * `ElementBase.anchors`. The `string & {}` form keeps autocomplete for the
 * standard names while still accepting arbitrary strings.
 */
export type NamedAnchor = StandardAnchor | (string & {});

export type AnchorRef =
  | { readonly kind: "named"; readonly name: NamedAnchor }
  /** Local-space offset inside the shape's bounding box (0..1 each axis). */
  | { readonly kind: "ratio"; readonly position: Vec2 }
  /** Absolute pixel offset from the shape's local-bounds origin. */
  | { readonly kind: "absolute"; readonly offset: Vec2 }
  /**
   * A point on a specific polygon edge: edge `index` (0-based, in vertex
   * order, wrapping) at parameter `t` (0..1 from the edge's start vertex
   * to its end vertex). Unlike `ratio` (which sits on the bounding box),
   * this stays on the shape's *real* sloped edge through resize / non-
   * uniform scale. Only meaningful for polygon shapes; resolving it on a
   * non-polygon falls back to the shape's geometric centre.
   */
  | { readonly kind: "edge"; readonly index: number; readonly t: number };

export type LinkEndpoint =
  | { readonly kind: "point"; readonly position: Vec2 }
  | { readonly kind: "anchor"; readonly elementId: ElementId; readonly anchor: AnchorRef }
  /**
   * Pin the endpoint to a fraction along the shape's outline (0..1
   * clockwise from the bounds' top-left). Survives move / resize /
   * rotation — the renderer re-samples the outline every frame. Use this
   * when "near a specific edge but not on a port" is what the user
   * actually meant.
   */
  | { readonly kind: "outline"; readonly elementId: ElementId; readonly ratio: number }
  /**
   * Float against the whole shape (modern-style "connect to object"). No
   * fixed anchor or ratio is stored — the endpoint's world point is
   * recomputed every frame as the intersection of the shape's outline
   * with the ray from the shape's centre toward the *other* endpoint. So
   * the connection always enters from the side facing its partner and
   * slides along the perimeter as either shape moves. Set when the user
   * drops a link on a shape's body (not on a specific port dot); dropping
   * on a dot yields `anchor` (fixed) instead.
   */
  | { readonly kind: "floating"; readonly elementId: ElementId };

/**
 * How to draw the line between an edge's two endpoints.
 *   - `straight` — single segment endpoint-to-endpoint.
 *   - `orthogonal` — Manhattan elbow (axis-aligned segments). The
 *     renderer picks intermediate waypoints; explicit `waypoints` on
 *     the edge override the default.
 *   - `bezier` — cubic curve. Renderer derives sensible control points
 *     from the endpoint directions.
 */
export type LinkRouting = "straight" | "orthogonal" | "bezier";

/**
 * Decoration drawn at the end of an edge segment. Renderers map the
 * style to its own primitives (Canvas2D / SVG marker / pdfkit shape).
 */
/**
 * Endpoint cap vocabulary, aligned with standard's connector ends. Grouped:
 *   - lines:    none, arrow (open V), openArrow (wider open V), roundedArrow
 *               (open V, round joins), arcArrow (concave back)
 *   - filled:   filledArrow (solid triangle), triangle (outlined — kept for
 *               back-compat), circle / filledCircle, rhombus / filledRhombus,
 *               diamond (outlined rhombus — back-compat alias)
 *   - ERD:      erdOne, erdOnlyOne, erdMany, erdOneOrMany, erdZeroOrOne,
 *               erdZeroOrMany (entity-relationship crow's-foot notation)
 */
export type ArrowheadStyle =
  | "none"
  | "arrow"
  | "openArrow"
  | "roundedArrow"
  | "arcArrow"
  | "triangle"
  | "filledArrow"
  | "circle"
  | "filledCircle"
  | "diamond"
  | "rhombus"
  | "filledRhombus"
  | "erdOne"
  | "erdOnlyOne"
  | "erdMany"
  | "erdOneOrMany"
  | "erdZeroOrOne"
  | "erdZeroOrMany";

export interface LinkArrowheads {
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
export interface LinkLabel {
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
export interface Link {
  readonly id: LinkId;
  readonly layerId: LayerId;
  readonly from: LinkEndpoint;
  readonly to: LinkEndpoint;
  /**
   * Free user-placed bend points (world coords), honoured by `straight` /
   * `bezier` routing. NOT used by `orthogonal` (elbow) — there the path is
   * the router's output (`routedPoints`); points can't be placed freely.
   */
  readonly waypoints?: readonly Vec2[];
  /**
   * Orthogonal-routing output: the corner points (world coords) between
   * `from` and `to` produced by the elbow router. Derived state — recomputed
   * on mutation (move / resize / endpoint / fixedSegments change), not
   * hand-authored. Empty / absent → renderer falls back to a heuristic elbow.
   */
  readonly routedPoints?: readonly Vec2[];
  /**
   * User-pinned elbow segments (standard model). Each entry pins one
   * interior segment's perpendicular coordinate (`pos`); `axis` is the
   * segment's orientation and `at` is its centre along its own axis — used to
   * re-identify the segment after the route re-flows (matching by position
   * rather than a fragile index survives topology changes on shape move).
   * Only meaningful for `orthogonal` routing.
   */
  readonly fixedSegments?: readonly {
    readonly axis: "h" | "v";
    readonly pos: number;
    readonly at: number;
  }[];
  /** Routing strategy. Default `straight`. */
  readonly routing?: LinkRouting;
  /**
   * When `true` (and `routing === "orthogonal"`), the elbow router avoids
   * EVERY scene shape, not just the two it binds — re-routing around any
   * obstacle that moves into the way. Persistent per-edge property (the
   * standard "route around shapes" toggle). Off / absent → the router only
   * keeps clear of its own two bound shapes (cheaper, the default).
   */
  readonly avoidObstacles?: boolean;
  /**
   * Visual flavour of the connector body.
   *
   * - `"line"` — thin stroked polyline (the default). Width =
   *   `style.strokeWidth`.
   * - `"block-arrow"` — filled polygon along the routed path: a
   *   thick body with a triangular head at the `to` endpoint
   *   (block-arrow connector style). Renderer
   *   reads `blockArrow.headLength` / `blockArrow.bodyThickness`
   *   for the silhouette.
   */
  readonly lineKind?: "line" | "block-arrow";
  /** Block-arrow tuning. Only honored when `lineKind === "block-arrow"`. */
  readonly blockArrow?: {
    /** Triangle head length in world pixels. Default 18. */
    readonly headLength?: number;
    /**
     * Thickness of the rectangular body in world pixels (also the
     * base width of the head triangle). Default 12.
     */
    readonly bodyThickness?: number;
  };
  /** Arrowhead decoration on each end. Default: no arrowheads. */
  readonly arrowheads?: LinkArrowheads;
  /** Optional inline label. */
  readonly label?: LinkLabel;
  /** Z-order key within `layerId`. */
  readonly order: FractionalIndex;
  readonly style: Style;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
