/**
 * Tunable constants for the renderer core. All "magic numbers" used by
 * `renderScene` / `renderLinks` / `renderGrid` live here so there is one
 * place to tweak performance / visual behaviour.
 */

import { GRID_COLOR, GRID_DOT_COLOR } from "@oh-just-another/tokens";
import type { LodOptions } from "./scene-renderer.js";

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
export const GRID_DOT_RADIUS_PX = 1;

/**
 * Below this on-screen spacing (px) a grid level paints nothing —
 * denser rendering reads as a flat haze. Only used by the fixed-ladder
 * path (`options.levels`); the default dynamic ladder uses the fade
 * bands below instead.
 */
export const GRID_MIN_SCREEN_SPACING_PX = 4;

// --- Dynamic (infinite) grid ladder -----------------------------------------
//
// The default grid is a SELF-SIMILAR, zoom-relative ladder: instead of a
// fixed set of world steps it renders a handful of rungs anchored to the
// current zoom, each rung `GRID_LEVEL_SUBDIV`× the previous. As you zoom
// the rungs slide — a finer rung fades in and a coarser one fades out —
// so new lines / dots keep appearing at EVERY zoom, not just at the
// hand-picked thresholds of a fixed ladder. Rungs finer than `gridSize`
// are purely visual (snap-to-grid still rounds to `gridSize`).

/** Ratio between adjacent rungs. 4 keeps the 64/16/4/1 cadence. */
export const GRID_LEVEL_SUBDIV = 4;

/**
 * How many self-similar rungs to paint at once (finest first). 3 keeps a
 * stable fully-opaque coarse tier while the finest rung fades in/out.
 */
export const GRID_LEVEL_RUNGS = 3;

/**
 * Line grid fade band (on-screen px). A rung is invisible at/below
 * `FROM`, ramps to full opacity by `FULL`, and stays full above. Tuned
 * so at 100 % (gridSize 20) the 20 px rung reads faint and the 80 px rung
 * is solid, while subdividing forever.
 */
export const GRID_LINE_FADE_FROM_PX = 12;
export const GRID_LINE_FADE_FULL_PX = 56;

/**
 * Dot grid fade band. Lower / tighter than lines so the base `gridSize`
 * dot lattice is fully solid at 100 % (the denser dot field) yet still
 * subdivides on zoom-in.
 */
export const GRID_DOT_FADE_FROM_PX = 10;
export const GRID_DOT_FADE_FULL_PX = 20;
