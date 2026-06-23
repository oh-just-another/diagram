import type { Vec2 } from "@oh-just-another/types";
import type { ElementBase } from "./shape.js";

/**
 * Apply a shape's local→world transform to a local-space point:
 * scale → rotate (about origin) → translate by `position`.
 */
export const localToWorld = (shape: ElementBase, local: Vec2): Vec2 => {
  const sx = local.x * shape.scale.x;
  const sy = local.y * shape.scale.y;
  const cos = Math.cos(shape.rotation);
  const sin = Math.sin(shape.rotation);
  return {
    x: shape.position.x + (sx * cos - sy * sin),
    y: shape.position.y + (sx * sin + sy * cos),
  };
};
