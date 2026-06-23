import type { Vec2 } from "@oh-just-another/types";

/**
 * Point on an ellipse outline at `ratio` (0..1), parameterised so ratio 0 is
 * the top (12 o'clock) and the trace runs clockwise: `angle = ratio·2π − π/2`,
 * `{ cx + rx·cos(angle), cy + ry·sin(angle) }`. Shared by the outline sampler
 * and the selection-contour loop so both walk the ellipse identically.
 */
export const ellipseOutlinePoint = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  ratio: number,
): Vec2 => {
  const angle = ratio * Math.PI * 2 - Math.PI / 2; // start at the top
  return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
};
