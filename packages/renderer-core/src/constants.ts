/**
 * Tunable constants for the renderer core. All "magic numbers" used by
 * `renderScene` / `renderLinks` / `renderGrid` live here so there is one
 * place to tweak performance / visual behaviour.
 */

import { GRID_COLOR, GRID_DOT_COLOR, UI_SURFACE } from "@oh-just-another/tokens";
import type { LodOptions } from "./rendering/scene-renderer.js";

/**
 * Level-of-detail floors, in ON-SCREEN pixels — decided per element from
 * what actually lands on screen, so the zoom level alone never degrades a
 * shape that is still large or a heading that is still readable.
 *
 * - `LOD_PLACEHOLDER_MAX_SCREEN_PX` — a shape whose longer side is below
 *   this on screen is a flat AABB fill (no detail is visible at that size
 *   anyway; saves ~10× renderer cost per shape). Range: 4–16.
 * - `LOD_MIN_TEXT_SCREEN_PX` — text whose font size on screen is below this
 *   is skipped (glyphs are unreadable below ~6 px; skipping the
 *   wrap + measure is the bulk of text cost). Range: 4–8.
 *
 * Hosts override per-render by passing `RenderSceneOptions.lod`.
 */
export const LOD_PLACEHOLDER_MAX_SCREEN_PX = 8;
export const LOD_MIN_TEXT_SCREEN_PX = 6;
export const DEFAULT_LOD: LodOptions = {
  placeholderMaxScreenPx: LOD_PLACEHOLDER_MAX_SCREEN_PX,
  minTextScreenPx: LOD_MIN_TEXT_SCREEN_PX,
};

/**
 * Neutral grey for the empty-text placeholder prompt (`TEXT_PLACEHOLDERS`
 * in `@oh-just-another/scene`) — the muted text tone of the light UI (the
 * canvas is always light).
 */
export const TEXT_PLACEHOLDER_COLOR = UI_SURFACE.light.textMuted;

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

/**
 * List layout metrics, in em (× font size):
 * - `LIST_INDENT_EM` — horizontal shift per nesting level; list paragraphs
 *   get one extra level for the marker slot. Reasonable range 1.2–1.8.
 * - `LIST_MARKER_GAP_EM` — gap between the marker's right edge and the
 *   item text. Reasonable range 0.3–0.6.
 */
export const LIST_INDENT_EM = 1.4;
export const LIST_MARKER_GAP_EM = 0.4;

/**
 * Inset between a shape's bounds and its embedded label text, in em
 * (× label font size). Reasonable range 0.3–1.0.
 */
export const LABEL_PADDING_EM = 0.5;

/**
 * Auto-fit font-size bounds (world px) for `ShapeLabel.autoFit` — the
 * binary search picks the largest size in this range whose layout fits
 * the shape body. Reasonable ranges: min 8–14, max 48–96.
 */
export const LABEL_AUTOFIT_MIN_PX = 10;
export const LABEL_AUTOFIT_MAX_PX = 64;

/**
 * Sticky-note chrome:
 * - `STICKY_DEFAULT_FILL` — card colour when `style.fill` is omitted.
 * - `STICKY_CORNER_RADIUS` — corner rounding in world units.
 * - `STICKY_AUTHOR_FONT_SIZE` — author-name strip font size.
 * - `STICKY_AUTHOR_COLOR` — author-name text colour.
 */
export const STICKY_DEFAULT_FILL = "#fff9b1";
export const STICKY_CORNER_RADIUS = 4;
export const STICKY_AUTHOR_FONT_SIZE = 10;
export const STICKY_AUTHOR_COLOR = "#8a8a6f";

/**
 * Sticky skeuomorphism (paper look):
 * - `STICKY_SHADOW_COLOR` / `STICKY_SHADOW_OFFSET_Y` — soft drop shadow
 *   under the card (offset in world units, 2–6 reasonable).
 * - `STICKY_TAG_*` — tag pill metrics along the bottom edge.
 */
export const STICKY_SHADOW_COLOR = "rgba(0, 0, 0, 0.18)";
export const STICKY_SHADOW_OFFSET_Y = 4;
export const STICKY_TAG_FONT_SIZE = 9;
export const STICKY_TAG_PAD_X = 5;
export const STICKY_TAG_HEIGHT = 14;
export const STICKY_TAG_GAP = 4;
export const STICKY_TAG_BG = "rgba(0, 0, 0, 0.08)";
export const STICKY_TAG_COLOR = "#555";

/**
 * Sticky reaction pills (bottom-left row, drawn by the renderer so they
 * reach PNG / SVG exports; the DOM layer only provides click zones).
 */
export const STICKY_REACTION_FONT_SIZE = 10;
export const STICKY_REACTION_HEIGHT = 16;
export const STICKY_REACTION_PAD_X = 6;
export const STICKY_REACTION_GAP = 4;
export const STICKY_REACTION_BG = "rgba(255, 255, 255, 0.85)";
export const STICKY_REACTION_COLOR = "#333";
/** Accent for the canvas-drawn "+" add-reaction button (iris 9). */
export const STICKY_REACTION_ADD_COLOR = "#5b5bd6";
/**
 * Reaction pills keep a CONSTANT on-screen size: their world size is
 * `base / zoom`. Below this zoom the reaction chrome (pills AND the "+"
 * button) is HIDDEN entirely — on a zoomed-out board constant-size
 * pills would swallow the cards. Also bounds the worst-case world size
 * for render-overflow estimates. Range 0.25–1.
 */
export const STICKY_REACTION_MIN_ZOOM = 0.5;

/**
 * What static exports (PNG / SVG) include by default. The export UI can
 * override per run; interactive rendering ignores these and draws
 * everything.
 */
export const EXPORT_CONTENT_DEFAULTS = {
  stickyReactions: true,
  stickyTags: true,
  stickyAuthor: true,
  // UI chrome, not content — never wanted in a static image.
  stickyAddButton: false,
} as const;
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

/** Fallback text colour of a link label when `LinkLabel.fill` is omitted. Near-black. */
export const LABEL_FILL_COLOR = "#222";

/** Fallback pill-background colour of a link label when `LinkLabel.background` is omitted. White. */
export const LABEL_BG_COLOR = "#fff";

/**
 * Corner radius of the label pill behind a link caption (world px at zoom 1).
 * 0 = square. Range: 0–8 (clamped visually by the pill height).
 */
export const LINK_LABEL_RADIUS = 4;
