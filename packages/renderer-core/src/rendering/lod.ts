import type { Bounds } from "@oh-just-another/types";

/**
 * Level-of-detail thresholds for `renderScene` — decided PER ELEMENT from
 * its actual size on screen, not from the zoom level, so a huge shape or a
 * giant heading stays readable at 1 % while a sticky note degrades long
 * before that.
 *
 * - **placeholderMaxScreenPx** → a shape whose on-screen AABB (longer side,
 *   world × zoom) is below this many pixels is drawn as a flat fill at its
 *   AABB and its renderer is skipped entirely.
 * - **minTextScreenPx** → text (standalone text shapes and embedded shape
 *   labels) whose on-screen font size (`fontSize × zoom`) is below this
 *   many pixels is skipped — it could not be read anyway, and its
 *   wrap + measure cost is the bulk of text rendering.
 *
 * Omit a threshold to disable that level.
 */
export interface LodOptions {
  readonly placeholderMaxScreenPx?: number;
  readonly minTextScreenPx?: number;
}

/** Longer side of `bounds` on screen at `zoom`, in CSS px. */
export const screenSizeOf = (bounds: Bounds, zoom: number): number =>
  Math.max(bounds.width, bounds.height) * zoom;

/** `true` when text of `fontSize` (world units) is below the readable LOD floor at `zoom`. */
export const isTextBelowLod = (
  fontSize: number,
  zoom: number,
  lod: LodOptions | undefined,
): boolean => lod?.minTextScreenPx !== undefined && fontSize * zoom < lod.minTextScreenPx;
