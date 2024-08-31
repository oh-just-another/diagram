/**
 * Tunable constants for the renderer core. All "magic numbers" used by
 * `renderScene` / `renderEdges` / `renderGrid` live here so hosts and
 * future-us have one place to tweak performance / visual behaviour.
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
