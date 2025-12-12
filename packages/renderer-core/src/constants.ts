/**
 * Tunable constants for the renderer core. All "magic numbers" used by
 * `renderScene` / `renderLinks` / `renderGrid` live here so there is one
 * place to tweak performance / visual behaviour.
 */

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
 * Curved (bezier) link rendering. The path is drawn as a Catmull-Rom
 * spline converted to cubic beziers so the line flows smoothly through
 * every point (endpoints + user waypoints) without corners.
 *
 * - `CURVE_CATMULL_TENSION` — divisor for the Catmull-Rom tangents in the
 *   spline→bezier conversion. 6 is the canonical uniform Catmull-Rom
 *   value (control point = P + (Pnext − Pprev) / 6). Larger → tighter
 *   (straighter) curve; smaller → looser / more rounded. Range: 4–8.
 * - `CURVE_BULGE_RATIO` — for a straight 2-point span (no waypoints) a
 *   synthetic mid-point is offset perpendicular to the chord by this
 *   fraction of the chord length, so "Curved" reads as a visible arc even
 *   between axis-aligned shapes (otherwise the spline degenerates to the
 *   straight line). Range: 0.1–0.3.
 * - `CURVE_BULGE_MAX_PX` — caps that perpendicular offset (world px) so a
 *   very long link doesn't balloon into a huge arc. Range: 40–120.
 */
export const CURVE_CATMULL_TENSION = 6;
export const CURVE_BULGE_RATIO = 0.18;
export const CURVE_BULGE_MAX_PX = 80;
