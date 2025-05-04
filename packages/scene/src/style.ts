import type { Color } from "@oh-just-another/types";
import {
  ADAPTIVE_CORNER_RADIUS,
  PROPORTIONAL_CORNER_RADIUS,
} from "./constants.js";

export type LineCap = "butt" | "round" | "square";
export type LineJoin = "miter" | "round" | "bevel";

/**
 * Where the stroke sits relative to the shape's path.
 *   `center`  — half the stroke width inside the path, half outside.
 *               Canvas2D / SVG default.
 *   `inside`  — stroke is fully inside the path (path = outer edge).
 *               Useful when shape bounds must match the fill region
 *               exactly (auto-layout / hit-tests).
 *   `outside` — stroke is fully outside (path = inner edge).
 */
export type StrokeAlign = "center" | "inside" | "outside";

/**
 * Corner-rounding spec for shapes that support it (rectangle, container,
 * box arrow, …). Borrowed from standard's adaptive model:
 *   `sharp`  — no rounding (sharp corners). Equivalent to omitting the
 *              field; kept for explicit serialisation.
 *   `round`  — rounded corners. Without `value`, falls back to the
 *              adaptive radius (fixed 32 px for big shapes, scales to
 *              25 % of the smaller side for shapes < 128 px so they
 *              don't read as a capsule).
 */
export interface Roundness {
  readonly type: "sharp" | "round";
  /**
   * Override the rounded-corner radius in world units. Ignored when
   * `type === "sharp"`. When omitted on `round` shapes the renderer
   * applies the adaptive default (see {@link Style}).
   */
  readonly value?: number;
}

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
  /** Stroke alignment relative to the path. Defaults to `center`. */
  readonly strokeAlign?: StrokeAlign;
  /** Corner-rounding spec. Omitted = sharp corners. */
  readonly roundness?: Roundness;
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

/**
 * Resolve a corner radius (in world units) for a rectangular shape
 * with the given `Roundness` spec and bounds. Implements standard's
 * adaptive algorithm:
 *
 *   • `roundness` undefined / `type === "sharp"` → 0 (sharp corners).
 *   • Explicit `value` → use it, clamped so the radius can't exceed
 *     half the smaller side (avoids self-overlapping corners on
 *     narrow shapes).
 *   • `type === "round"` without `value` → adaptive: fixed
 *     {@link ADAPTIVE_CORNER_RADIUS} for shapes ≥ cutoff
 *     (`ADAPTIVE / PROPORTIONAL = 128 px`), scaled proportionally
 *     ({@link PROPORTIONAL_CORNER_RADIUS}) for anything smaller so
 *     thumbnails don't look like capsules.
 *
 * The "smaller side" is `min(width, height)` — corners use the same
 * radius on every axis (uniform rounding).
 */
export const getCornerRadius = (
  roundness: Roundness | undefined,
  width: number,
  height: number,
): number => {
  if (!roundness || roundness.type === "sharp") return 0;
  const smaller = Math.min(Math.abs(width), Math.abs(height));
  if (smaller <= 0) return 0;
  if (roundness.value !== undefined) {
    // Honour the override but clamp to half the smaller side so
    // the corner radii can't overlap on narrow shapes (would
    // produce a degenerate path).
    return Math.max(0, Math.min(roundness.value, smaller / 2));
  }
  // Adaptive default: proportional below the cutoff, fixed above.
  const cutoff = ADAPTIVE_CORNER_RADIUS / PROPORTIONAL_CORNER_RADIUS;
  if (smaller <= cutoff) return smaller * PROPORTIONAL_CORNER_RADIUS;
  return ADAPTIVE_CORNER_RADIUS;
};
