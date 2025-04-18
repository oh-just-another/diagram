/**
 * Number of quadratic Beziers substituted for one cubic on the
 * subdivision path. Higher → smoother high-curvature cubics, more
 * triangles; lower → fewer triangles but visible kinks on
 * direction-reversing curves. `8` keeps per-triangle curve error
 * under ~0.5 px at 4× zoom for cubics under ~200 world units.
 */
export const DEFAULT_CUBIC_SUBDIVISIONS = 8;
