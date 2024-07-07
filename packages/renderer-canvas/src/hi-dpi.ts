/**
 * Configures a `<canvas>` for hi-DPI rendering. Sets the bitmap size to
 * `width * dpr` × `height * dpr`, the CSS size to `width` × `height`, and the
 * context transform to `scale(dpr, dpr)` so subsequent draw calls operate in
 * CSS pixels. Returns the DPR used so callers can recompute on monitor changes.
 *
 * Call again when the canvas is resized or the DPR changes (e.g. window moved
 * between monitors). It always resets the transform from scratch.
 */
export const setupHiDpi = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number = window.devicePixelRatio || 1,
): number => {
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to obtain 2D context");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return dpr;
};
