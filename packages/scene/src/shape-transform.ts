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

/**
 * Inverse of {@link localToWorld}: map a world-space point into the shape's
 * local coordinates (un-translate → un-rotate → un-scale). Axis-aligned scale
 * of 0 collapses that axis to 0 to avoid a divide-by-zero.
 */
export const worldToLocal = (shape: ElementBase, world: Vec2): Vec2 => {
  const dx = world.x - shape.position.x;
  const dy = world.y - shape.position.y;
  const cos = Math.cos(shape.rotation);
  const sin = Math.sin(shape.rotation);
  // Rotate by -rotation.
  const rx = dx * cos + dy * sin;
  const ry = -dx * sin + dy * cos;
  return {
    x: shape.scale.x === 0 ? 0 : rx / shape.scale.x,
    y: shape.scale.y === 0 ? 0 : ry / shape.scale.y,
  };
};
