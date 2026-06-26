/**
 * Tunable constants for the editor host package (browser PNG export, GIF
 * animation). Magic numbers live here per the repo's constants policy so a
 * maintainer can tune framing / decode behaviour in one place.
 */

/**
 * Padding around the scene bbox when exporting a PNG, in world units. Matches
 * the `zoomToFit` default so exported framing feels like an on-screen fit.
 * Range: 0 (tight crop) to ~100 (generous border).
 */
export const EXPORT_PADDING_WORLD = 20;

/**
 * Fallback per-frame delay used when a decoded GIF frame reports 0 ms (some
 * encoders do). Range: ~20–200 ms; lower plays faster, higher slower.
 */
export const DEFAULT_FRAME_DELAY_MS = 100;
