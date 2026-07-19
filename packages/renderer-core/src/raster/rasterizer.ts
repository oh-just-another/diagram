import type { Vec2 } from "@oh-just-another/types";
import type { PathCommand } from "@oh-just-another/scene";

// Process-global active rasterizer. A host installs one; backend code
// reads it at draw time. `null` falls back to the backend's built-in JS
// sampler.

let activeRasterizer: Rasterizer | null = null;

export const setActiveRasterizer = (r: Rasterizer | null): void => {
  activeRasterizer = r;
};

export const getActiveRasterizer = (): Rasterizer | null => activeRasterizer;

/**
 * 2D rasterisation helpers. Lets a host swap the pure-TS bezier flatten /
 * stroke-to-fill / gradient ops for a WASM implementation when batch
 * processing dominates (handwriting demos, dense edge meshes). Default uses
 * the JS path in `@oh-just-another/math/bezier`.
 */
export interface Rasterizer {
  /**
   * Flatten a path's bezier segments into a polyline at the given
   * tolerance (max distance between approximation and curve in
   * world pixels). Output points are in world coords.
   */
  flatten(commands: readonly PathCommand[], tolerance: number): readonly Vec2[];

  /**
   * Convert a stroked polyline into the outline of the stroke
   * (so a backend without native stroke can fill it as a polygon).
   */
  strokeToFill(
    polyline: readonly Vec2[],
    width: number,
    options?: {
      readonly cap?: "butt" | "round" | "square";
      readonly join?: "miter" | "round" | "bevel";
    },
  ): readonly Vec2[];
}
