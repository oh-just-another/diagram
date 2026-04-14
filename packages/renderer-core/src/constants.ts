/**
 * Tunable constants for the renderer core. All "magic numbers" used by
 * `renderScene` / `renderLinks` / `renderGrid` live here so there is one
 * place to tweak performance / visual behaviour.
 */

import { GRID_COLOR, GRID_DOT_COLOR } from "@oh-just-another/tokens";
import type { LodOptions } from "./scene-renderer.js";
import type { GridLevel } from "./grid-renderer.js";

/**
 * Default zoom thresholds for the level-of-detail pipeline. Tuned for
 * a typical 1920×1080 viewport viewing a 10k-shape scene.
 *
 * - `placeholder: 0.15` — below 15% zoom (one screen ≈ 6.7× world),
 *   shapes degrade to flat AABB fills. Saves ~10× renderer cost per
 *   shape.
 * - `hideText: 0.4` — below 40% zoom text glyphs are too small to read
 *   anyway; skipping the `wrapText` + `measureText` calls saves the
 *   bulk of text rendering cost.
 *
 * Hosts override per-render by passing `RenderSceneOptions.lod`.
 */
export const DEFAULT_LOD: LodOptions = {
  placeholder: 0.15,
  hideText: 0.4,
};

/**
 * Grey colour used for placeholder fills when LOD switches to the
 * cheapest path. A mid-tone neutral that blends with most scene
 * palettes; override via `RenderSceneOptions.placeholderFill`.
 */
export const DEFAULT_PLACEHOLDER_FILL = "#bbb";

/**
 * Viewport-rect inflation factor applied by hosts when computing the
 * world-space culling rect. 0.05 = 5% padding on each side — enough
 * to avoid flicker during a one-frame pan without keeping much
 * off-screen geometry alive in the renderer.
 */
export const VIEWPORT_CULL_PADDING_RATIO = 0.05;

/**
 * Text-decoration geometry (underline / strikethrough), as fractions of
 * font size, measured from the line's top (the renderer draws text with
 * a top baseline).
 *
 * - `TEXT_DECORATION_THICKNESS` — line thickness ≈ 6% of font size
 *   (clamped to ≥1 px in the renderer).
 * - `TEXT_UNDERLINE_OFFSET` — underline top, ~92% down (just below the
 *   glyph baseline).
 * - `TEXT_STRIKETHROUGH_OFFSET` — strikethrough centre, ~50% (x-height).
 */
export const TEXT_DECORATION_THICKNESS = 0.06;
export const TEXT_UNDERLINE_OFFSET = 0.92;
export const TEXT_STRIKETHROUGH_OFFSET = 0.5;

/**
 * Corner radius (world px) for the rounded bends of an elbow (orthogonal)
 * connector and of a straight connector broken by user waypoints. Each
 * corner is replaced by a quadratic arc of this radius, clamped to half the
 * shorter adjacent segment so short segments don't overshoot. 0 disables
 * rounding (sharp corners). Range: 0–16.
 */
export const LINK_CORNER_RADIUS = 10;

// --- Grid -------------------------------------------------------------------
//
// Lines and dots are tuned independently: a ruled line covers far more
// pixels than a lone dot, so the dot grid needs a darker colour, a
// slightly fatter mark, and a denser ladder to read as clearly as the
// line grid at the same zoom.

/** Stroke colour for the ruled (`"lines"`) grid. Neutral step-6 gray. */
export const GRID_LINE_COLOR = GRID_COLOR;

/** Fill colour for the dotted (`"dots"`) grid — darker step-9 gray so the dots stay legible on a gray canvas. */
export const GRID_DOT_FILL = GRID_DOT_COLOR;

/** On-screen stroke width (px) of a grid line. Divided by zoom at the use site so the line stays 1 px regardless of view scale. */
export const GRID_LINE_WIDTH_PX = 1.0;

/**
 * Dot radius (screen px) for `gridStyle === "dots"`. Constant across
 * zoom (divided by `zoom` at the use site). Reads as a crisp anchor on
 * a gray surface. Range: 1.0–2.0.
 */
export const GRID_DOT_RADIUS_PX = 1.4;

/**
 * Below this on-screen spacing (px) a grid level paints nothing —
 * denser rendering reads as a flat haze. Matches standard's behaviour
 * where a level is implicitly hidden once it gets too dense.
 */
export const GRID_MIN_SCREEN_SPACING_PX = 4;

/**
 * Default ruled-grid ladder: 4 self-similar levels tuned for a 20-unit
 * base grid. Coarsest rung is always visible; finer rungs fade in around
 * 1× zoom and below. (standard cadence.)
 */
export const DEFAULT_GRID_LINE_LEVELS: readonly GridLevel[] = [
  { min: -1, mid: 0.15, step: 64 },
  { min: 0.05, mid: 0.375, step: 16 },
  { min: 0.15, mid: 1, step: 4 },
  { min: 0.7, mid: 2.5, step: 1 },
];

/**
 * Default dot-grid ladder — shifted one rung finer than the line ladder
 * so the base `step: 1` lattice (one dot per `gridSize`, ≈20 px at zoom
 * 1) is fully visible at default zoom. Dots are cheaper to read densely
 * than lines, so the user gets a tighter, more useful snapping field.
 */
export const DEFAULT_GRID_DOT_LEVELS: readonly GridLevel[] = [
  { min: -1, mid: 0.15, step: 16 },
  { min: 0.05, mid: 0.375, step: 4 },
  { min: 0.15, mid: 1, step: 1 },
];
