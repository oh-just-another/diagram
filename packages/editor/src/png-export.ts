import type { Scene } from "@oh-just-another/scene";
import {
  renderLinks,
  renderGrid,
  renderScene,
  EXPORT_CONTENT_DEFAULTS,
  type RenderSceneOptions,
} from "@oh-just-another/renderer-core";
import { createOffscreenCanvas2DTarget } from "@oh-just-another/renderer-canvas";
import { fitViewportTo, sceneBounds } from "./scene-subset.js";

/**
 * Browser-side PNG export — renders the **full scene** (not just the
 * current viewport) into an OffscreenCanvas via the `renderScene` +
 * `renderLinks` pipeline, then converts to a PNG blob.
 *
 * Three variants, exposed as separate menu items:
 *
 *   • "transparent"     — no background fill, PNG alpha channel preserved.
 *   • "color"           — solid fill in the host's canvas colour.
 *   • "color-and-grid"  — solid fill + the same grid the user sees on
 *                         the canvas (same gridStyle).
 *
 * Returns `null` when the scene has no shapes (host shows an alert).
 */

/** Variant selector — drives background / grid handling. */
export type PngExportBackground = "transparent" | "color" | "color-and-grid";

export interface PngExportOptions {
  readonly background: PngExportBackground;
  /** Device-pixel scale. 2 = retina-quality (host default). */
  readonly scale: number;
  /**
   * CSS colour string used for the solid background fill. Ignored when
   * `background === "transparent"`. Host reads the current
   * `--du-canvas-bg` CSS variable so the PNG matches what the user sees.
   */
  readonly backgroundColor: string;
  /**
   * Content switches for meta layers (sticky reactions / tags / author).
   * Merged over {@link EXPORT_CONTENT_DEFAULTS}; omit for the defaults.
   */
  readonly content?: RenderSceneOptions["content"];
}

export const exportSceneToPng = async (
  scene: Scene,
  options: PngExportOptions,
): Promise<Blob | null> => {
  if (typeof OffscreenCanvas === "undefined") return null;

  const bbox = sceneBounds(scene);
  if (!bbox) return null; // empty scene — host shows an alert

  // Synthesise a viewport that maps the padded world bbox onto the
  // OffscreenCanvas backbuffer at the requested scale.
  const fitted = fitViewportTo(scene, bbox, options.scale);
  const canvasW = fitted.width;
  const canvasH = fitted.height;
  const exportScene = fitted.scene;

  const { canvas, target } = createOffscreenCanvas2DTarget(canvasW, canvasH);

  // Background fill via the kernel target before shapes render (with
  // skipClear so the fill survives the renderScene pass). Drawing
  // through the target keeps it backend-agnostic — the same path works
  // for any RenderTarget impl.
  if (options.background !== "transparent") {
    target.setFill(options.backgroundColor);
    target.beginPath();
    target.rect(0, 0, canvasW, canvasH);
    target.fill();
  }

  // Grid pass — only for the color-and-grid variant, and only when the scene
  // has the grid enabled.
  if (options.background === "color-and-grid" && exportScene.viewport.gridEnabled) {
    renderGrid(exportScene, target);
  }

  // Shapes (skipClear: true so background / grid survive).
  renderScene(exportScene, target, {
    skipClear: true,
    content: { ...EXPORT_CONTENT_DEFAULTS, ...options.content },
  });
  renderLinks(exportScene, target);

  return canvas.convertToBlob({ type: "image/png" });
};
