import type { Scene } from "@oh-just-another/scene";
import { renderToPng } from "@oh-just-another/headless";
import { resolveScene, sceneForFrame, sceneForRegion } from "./region.js";
import { setPngDpi } from "./png-dpi.js";
import type { ExportPngOptions } from "./options.js";

/**
 * Render a `Scene` (or JSON document) to a PNG `Uint8Array` with optional
 * crop region, scale and DPI metadata. Wraps `renderToPng` and adds
 * world-coordinate cropping and physical-pixel metadata.
 *
 * `scale` and the optional `dpi` are independent: `scale` controls the
 * actual pixel dimensions; `dpi` only writes a `pHYs` chunk so document
 * viewers know how big to print the image.
 */
export const exportPng = async (
  scene: Scene | string,
  options: ExportPngOptions = {},
): Promise<Uint8Array> => {
  const resolved = resolveScene(scene);
  const cropped = options.frameId
    ? sceneForFrame(resolved, options.frameId) ?? sceneForRegion(resolved, options.region)
    : sceneForRegion(resolved, options.region);

  const renderOpts: {
    width?: number;
    height?: number;
    scale?: number;
    background?: string;
  } = {};
  if (options.width !== undefined) renderOpts.width = options.width;
  if (options.height !== undefined) renderOpts.height = options.height;
  if (options.scale !== undefined) renderOpts.scale = options.scale;
  if (options.background !== undefined) renderOpts.background = options.background;

  let png = await renderToPng(cropped, renderOpts);
  if (options.dpi !== undefined) png = setPngDpi(png, options.dpi);
  return png;
};
