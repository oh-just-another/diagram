import type { Bounds, ShapeId } from "@oh-just-another/types";

/**
 * Rectangle in scene-world coordinates to clip the exported image to.
 * The output canvas is sized to match `region.width × region.height`
 * (multiplied by `scale` / `dpi`).
 */
export type ExportRegion = Bounds;

/**
 * Format-agnostic export options. Concrete `exportPng` / `exportPdf` extend
 * this with their own knobs.
 */
export interface BaseExportOptions {
  /**
   * Crop rectangle in world coordinates. Defaults to the scene's
   * `viewport.size` (the full visible area at zoom = 1). Conflicts with
   * `frameId` — when both are supplied, `frameId` wins.
   */
  readonly region?: ExportRegion;
  /**
   * Export only the content of a specific frame. The exporter looks up
   * the frame by id, uses its world bounds as the crop region, and
   * renders only shapes whose `frameId` matches.
   */
  readonly frameId?: ShapeId;
  /**
   * Output width override in CSS pixels. Defaults to `region.width` (or the
   * scene viewport width).
   */
  readonly width?: number;
  /** Output height override in CSS pixels. Defaults similar to `width`. */
  readonly height?: number;
  /** Background colour painted under the scene. Default: white. */
  readonly background?: string;
}

export interface ExportPngOptions extends BaseExportOptions {
  /**
   * Device-pixel multiplier. `2` ⇒ retina quality. Overrides any `width` /
   * `height`. Default: 1.
   */
  readonly scale?: number;
  /**
   * Print-quality DPI. Embeds a `pHYs` chunk into the PNG so apps that read
   * physical dimensions (Word, InDesign, browsers' print) reflow correctly.
   * Default: omitted (96 DPI implied — screen resolution).
   */
  readonly dpi?: number;
}

export type PdfPageSize =
  | "A4"
  | "A5"
  | "Letter"
  | "Legal"
  | "Tabloid"
  | { width: number; height: number };
export type PdfOrientation = "portrait" | "landscape";

export interface ExportPdfOptions extends BaseExportOptions {
  /** PDF page size. Default: `"A4"`. */
  readonly pageSize?: PdfPageSize;
  /** Page orientation. Default: `"portrait"`. */
  readonly orientation?: PdfOrientation;
  /** Page margin in PDF points (1pt = 1/72in). Default: 36 (0.5in). */
  readonly margin?: number;
  /** PDF metadata. */
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
}
