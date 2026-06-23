/** Restrict `v` to the inclusive range `[min, max]`. */
export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

/** Restrict `v` to `[0, 1]`. */
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
