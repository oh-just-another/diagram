/**
 * Configures a `<canvas>` for hi-DPI rendering. Sets the bitmap size to
 * `width * dpr` × `height * dpr`, the CSS size to `width` × `height`, and the
 * context transform to `scale(dpr, dpr)` so subsequent draw calls operate in
 * CSS pixels. Returns the DPR used so callers can recompute on monitor changes.
 *
 * IDEMPOTENT: assigning `canvas.width` / `canvas.height` resets both
 * the bitmap AND the context transform — even when the new value equals
 * the old. Hosts call this from a `ResizeObserver` that may fire with
 * the same size on attach; without the guard each tick would wipe the
 * existing canvas content. We early-return when bitmap + CSS size +
 * DPR are already exactly right.
 */
export const setupHiDpi = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number = window.devicePixelRatio || 1,
): number => {
  const targetW = Math.round(width * dpr);
  const targetH = Math.round(height * dpr);
  const cssW = `${width}px`;
  const cssH = `${height}px`;
  if (
    canvas.width === targetW &&
    canvas.height === targetH &&
    canvas.style.width === cssW &&
    canvas.style.height === cssH
  ) {
    return dpr;
  }
  canvas.width = targetW;
  canvas.height = targetH;
  canvas.style.width = cssW;
  canvas.style.height = cssH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to obtain 2D context");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return dpr;
};
