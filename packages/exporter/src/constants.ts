/**
 * Tunable defaults for the exporter package (PDF page layout, scene-size
 * inference fallbacks). Magic numbers live here per the repo's constants
 * policy so framing / page defaults can be tuned in one place.
 */

/**
 * Default PDF page margin, in PDF points (1pt = 1/72in). 36 = 0.5in.
 * Range: 0 (edge-to-edge) to ~72 (1in).
 */
export const DEFAULT_PDF_MARGIN_PT = 36;

/**
 * Standard PDF page sizes in points (72 / inch). Keyed by the public
 * `PdfPageSize` string union; used as the default page table for `exportPdf`.
 */
export const PDF_PAGE_SIZES_PT: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  Letter: [612, 792],
  Legal: [612, 1008],
  Tabloid: [792, 1224],
};

/**
 * Fallback width, in CSS pixels, for an empty scene with no explicit viewport
 * size. Range: a few hundred to ~2000; just needs to be non-degenerate.
 */
export const FALLBACK_SCENE_WIDTH = 800;

/**
 * Fallback height, in CSS pixels, for an empty scene with no explicit viewport
 * size. Range: a few hundred to ~2000; just needs to be non-degenerate.
 */
export const FALLBACK_SCENE_HEIGHT = 600;

/**
 * Coarse per-axis size estimate, in CSS pixels, used when inferring a scene's
 * viewport from shape positions without a bounder registry. Range: ~50–200.
 */
export const SHAPE_SIZE_ESTIMATE = 100;
