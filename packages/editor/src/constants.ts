/**
 * Tunable constants for the editor host package (browser PNG export, GIF
 * animation). Magic numbers live here per the repo's constants policy so a
 * maintainer can tune framing / decode behaviour in one place.
 */

import { DEFAULT_CANVAS_BACKGROUND } from "@oh-just-another/scene";

/**
 * Canvas paper presets behind the main menu's Board › Background colour
 * rows. The default paper is listed so the user can return to it; picking
 * it clears `viewport.background`. Colours are plain CSS hex.
 */
export const CANVAS_BACKGROUND_PRESETS: readonly {
  readonly id: string;
  readonly label: string;
  readonly color: string;
}[] = [
  { id: "white", label: "White", color: "#ffffff" },
  { id: "light-gray", label: "Light gray", color: DEFAULT_CANVAS_BACKGROUND },
  { id: "gray", label: "Gray", color: "#d9d9d9" },
  { id: "dark-gray", label: "Dark gray", color: "#4a4a4a" },
  { id: "black", label: "Black", color: "#000000" },
  { id: "light-blue", label: "Light blue", color: "#e3f0fb" },
];

/** Side of the colour swatch drawn in a Background colour menu row, px. */
export const CANVAS_BACKGROUND_SWATCH_PX = 14;

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
