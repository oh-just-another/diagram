/**
 * 2D vector / point in any coordinate space (world, local, screen).
 * Immutable by convention.
 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/**
 * Alias for Vec2 used in API surfaces that semantically operate on points
 * rather than directions. Has no runtime distinction from Vec2.
 */
export type Point = Vec2;
