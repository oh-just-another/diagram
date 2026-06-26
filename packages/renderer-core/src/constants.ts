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

// --- Block-arrow shape (BlockArrowElement) ----------------------------------

/**
 * Fraction of the shape's length given to the arrow head when
 * `BlockArrowElement.headRatio` is omitted. 0.4 = head spans the last 40 %,
 * body the first 60 %. Clamped to `ARROWHEAD_RATIO_MIN`..`ARROWHEAD_RATIO_MAX`.
 */
export const ARROWHEAD_HEAD_RATIO = 0.4;

/**
 * Fraction of the shape's cross-axis filled by the body when
 * `BlockArrowElement.bodyThickness` is omitted. 0.5 = body half as thick as
 * the box. Clamped to `ARROWHEAD_RATIO_MIN`..`ARROWHEAD_RATIO_MAX`.
 */
export const ARROWHEAD_BODY_THICKNESS = 0.5;

/**
 * Lower clamp for the block-arrow head/body ratios so a degenerate input can't
 * collapse the head or body to nothing. Range: 0–`ARROWHEAD_RATIO_MAX`.
 */
export const ARROWHEAD_RATIO_MIN = 0.1;

/**
 * Upper clamp for the block-arrow head/body ratios so the head/body can't eat
 * the whole box. Range: `ARROWHEAD_RATIO_MIN`–1.
 */
export const ARROWHEAD_RATIO_MAX = 0.9;

// --- Frame chrome colours ---------------------------------------------------

/** Outline colour of a frame when no explicit style overrides it. Neutral gray. */
export const FRAME_STROKE_COLOR = "#888";

/** Default body fill of a frame when `style.fill` is omitted. White. */
export const FRAME_FILL_COLOR = "#ffffff";

/** Background fill of the frame's header strip. Near-black. */
export const FRAME_HEADER_BG_COLOR = "#222";

/** Text colour of the frame's header label. Light gray for contrast on the dark strip. */
export const FRAME_HEADER_TEXT_COLOR = "#ddd";

// --- Edge / link rendering defaults -----------------------------------------

/**
 * Length (world px) of a block-arrow edge's head triangle when
 * `Link.blockArrow.headLength` is omitted. The body terminates this far before
 * the endpoint so the head fills the gap. Range: ~8–40.
 */
export const BLOCK_ARROW_HEAD_LENGTH = 18;

/**
 * Body thickness (world px) of a block-arrow edge when
 * `Link.blockArrow.bodyThickness` is omitted. Offset half this on each side of
 * the routed path. Range: ~4–32.
 */
export const BLOCK_ARROW_BODY_THICKNESS = 12;

/** Fallback fill for a block-arrow edge when neither `style.fill` nor `style.stroke` is set. Mid gray. */
export const BLOCK_ARROW_FILL_COLOR = "#444";

/** Fallback stroke for a block-arrow edge when `style.stroke` is omitted. Near-black. */
export const BLOCK_ARROW_STROKE_COLOR = "#222";

/**
 * Arrowhead size (world px) when `LinkArrowheads.size` is omitted. Drives the
 * wing/length scale of every arrowhead style. Range: ~6–24.
 */
export const ARROWHEAD_SIZE = 10;

/** Fallback stroke colour for an edge / its arrowheads when `style.stroke` is omitted. Black. */
export const EDGE_STROKE_COLOR = "#000";

/**
 * Position along the edge (0 = start, 1 = end) where a link label sits when
 * `LinkLabel.position` is omitted. 0.5 = midpoint.
 */
export const LABEL_POSITION = 0.5;

/** Font size (world px) of a link label when `LinkLabel.fontSize` is omitted. */
export const LABEL_FONT_SIZE = 12;

/** Fallback text colour of a link label when `LinkLabel.fill` is omitted. Near-black. */
export const LABEL_FILL_COLOR = "#222";

/** Fallback pill-background colour of a link label when `LinkLabel.background` is omitted. White. */
export const LABEL_BG_COLOR = "#fff";
