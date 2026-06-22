import {
  getLayersInOrder,
  getElementWorldBounds,
  getElementsInLayer,
  type Scene,
} from "@oh-just-another/scene";
import type { Bounds } from "@oh-just-another/types";
import { renderLinks, renderGrid, renderScene } from "@oh-just-another/renderer-core";
import { createOffscreenCanvas2DTarget } from "@oh-just-another/renderer-canvas";

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
}

/**
 * Padding around the scene bbox, in world units. Matches the
 * `zoomToFit` default so the exported framing feels like "what fit
 * on screen would look like". Hosts that want a tight bbox can crop
 * after the fact.
 */
const EXPORT_PADDING_WORLD = 20;

export const exportSceneToPng = async (
  scene: Scene,
  options: PngExportOptions,
): Promise<Blob | null> => {
  if (typeof OffscreenCanvas === "undefined") return null;

  const bbox = computeSceneBbox(scene);
  if (!bbox) return null; // empty scene — host shows an alert

  const padded: Bounds = {
    x: bbox.x - EXPORT_PADDING_WORLD,
    y: bbox.y - EXPORT_PADDING_WORLD,
    width: bbox.width + 2 * EXPORT_PADDING_WORLD,
    height: bbox.height + 2 * EXPORT_PADDING_WORLD,
  };

  const canvasW = Math.max(1, Math.ceil(padded.width * options.scale));
  const canvasH = Math.max(1, Math.ceil(padded.height * options.scale));

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

  // Synthesise a viewport that maps the padded world bbox onto the
  // OffscreenCanvas backbuffer at the requested scale.
  // `pan = (padded.x, padded.y)` → world origin pixel (0, 0).
  // `zoom = scale` → world unit covers `scale` device pixels.
  // `size = canvasW × canvasH` → renderers see the full backbuffer.
  const exportScene: Scene = {
    ...scene,
    viewport: {
      pan: { x: padded.x, y: padded.y },
      zoom: options.scale,
      rotation: 0,
      size: { width: canvasW, height: canvasH },
      gridEnabled: scene.viewport.gridEnabled,
      ...(scene.viewport.gridStyle !== undefined ? { gridStyle: scene.viewport.gridStyle } : {}),
    },
  };

  // Grid pass — only for the color-and-grid variant, and only when the scene
  // has the grid enabled.
  if (options.background === "color-and-grid" && exportScene.viewport.gridEnabled) {
    renderGrid(exportScene, target);
  }

  // Shapes (skipClear: true so background / grid survive).
  renderScene(exportScene, target, { skipClear: true });
  renderLinks(exportScene, target);

  return canvas.convertToBlob({ type: "image/png" });
};

const computeSceneBbox = (scene: Scene): Bounds | null => {
  let acc: Bounds | null = null;
  for (const layer of getLayersInOrder(scene)) {
    if (!layer.visible) continue;
    for (const shape of getElementsInLayer(scene, layer.id)) {
      const b = getElementWorldBounds(shape);
      acc = acc ? unionBounds(acc, b) : b;
    }
  }
  return acc;
};

/** Inlined AABB union — avoids pulling `@math` into the host package. */
const unionBounds = (a: Bounds, b: Bounds): Bounds => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
};
