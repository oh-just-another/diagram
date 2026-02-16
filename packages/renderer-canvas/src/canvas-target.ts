import type { Bounds, Transform } from "@oh-just-another/types";
import type {
  FillRule,
  LineCap,
  LineJoin,
  RenderTarget,
  TextAlign,
  TextBaseline,
} from "@oh-just-another/renderer-core";
import { isDrawableImageSource, warnSkippedImage } from "./image-source.js";

/**
 * Wraps a `CanvasRenderingContext2D` (or compatible OffscreenCanvas context)
 * as a backend-agnostic `RenderTarget`. Coordinates passed to the target are
 * in CSS pixels; the device-pixel scaling is applied once at construction by
 * the device-pixel-ratio (DPR) helper, so all draw calls see CSS units.
 *
 * `size` reports the CSS-pixel size that draw calls operate in. The underlying
 * canvas bitmap may be larger (DPR × size) but that is transparent here.
 */
export class Canvas2DTarget implements RenderTarget {
  private readonly ctx: CanvasRenderingContext2D;
  private _width: number;
  private _height: number;
  /**
   * Device-pixel-ratio the canvas bitmap is scaled by (see `setupHiDpi`).
   * `setTransform` / `resetTransform` take a transform that maps world →
   * CSS pixels; they pre-multiply by `scale(dpr)` so the result lands in
   * the DPR-scaled device buffer.
   */
  private dpr: number;

  /**
   * `width` / `height` are CSS-pixel dimensions. `dpr` must match the value
   * `setupHiDpi` used to scale the bitmap (default 1). The constructor assumes
   * the caller has already configured the canvas bitmap + context transform.
   */
  constructor(ctx: CanvasRenderingContext2D, width: number, height: number, dpr = 1) {
    this.ctx = ctx;
    this._width = width;
    this._height = height;
    this.dpr = dpr;
  }

  get size(): { readonly width: number; readonly height: number } {
    return { width: this._width, height: this._height };
  }

  /** Mutator for callers that resize the canvas. `dpr` updates the device
   *  scale when the canvas moves to a different-density display. */
  resize(width: number, height: number, dpr?: number): void {
    this._width = width;
    this._height = height;
    if (dpr !== undefined) this.dpr = dpr;
  }

  // --- Style ---

  setFill(color: string | null): void {
    this.ctx.fillStyle = color ?? "transparent";
  }
  setStroke(color: string | null): void {
    this.ctx.strokeStyle = color ?? "transparent";
  }
  setStrokeWidth(width: number): void {
    this.ctx.lineWidth = width;
  }
  setOpacity(alpha: number): void {
    this.ctx.globalAlpha = alpha;
  }
  setLineCap(cap: LineCap): void {
    this.ctx.lineCap = cap;
  }
  setLineJoin(join: LineJoin): void {
    this.ctx.lineJoin = join;
  }
  setDashArray(dash: readonly number[] | null): void {
    this.ctx.setLineDash(dash ? [...dash] : []);
  }
  setFont(
    fontFamily: string,
    fontSize: number,
    options?: { weight?: "normal" | "bold"; style?: "normal" | "italic" },
  ): void {
    // CSS font shorthand order: `<style> <weight> <size> <family>`.
    const style = options?.style === "italic" ? "italic " : "";
    const weight = options?.weight === "bold" ? "bold " : "";
    this.ctx.font = `${style}${weight}${fontSize}px ${fontFamily}`;
  }
  setTextAlign(align: TextAlign): void {
    this.ctx.textAlign = align === "center" ? "center" : align;
  }
  setTextBaseline(baseline: TextBaseline): void {
    this.ctx.textBaseline =
      baseline === "middle" ? "middle" : baseline === "top" ? "top" : "bottom";
  }

  // --- State stack ---

  save(): void {
    this.ctx.save();
  }
  restore(): void {
    this.ctx.restore();
  }

  // --- Transform ---

  translate(dx: number, dy: number): void {
    this.ctx.translate(dx, dy);
  }
  rotate(radians: number): void {
    this.ctx.rotate(radians);
  }
  scale(sx: number, sy: number): void {
    this.ctx.scale(sx, sy);
  }
  setTransform(t: Transform): void {
    // Compose with the DPR base: device = scale(dpr) · t. `t` maps world →
    // CSS px; the bitmap is dpr× bigger, so every coordinate scales by dpr.
    const d = this.dpr;
    this.ctx.setTransform(d * t.a, d * t.b, d * t.c, d * t.d, d * t.e, d * t.f);
  }
  resetTransform(): void {
    // Reset to the DPR base (NOT raw identity) so CSS-px draws stay scaled.
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // --- Path primitives ---

  beginPath(): void {
    this.ctx.beginPath();
  }
  closePath(): void {
    this.ctx.closePath();
  }
  moveTo(x: number, y: number): void {
    this.ctx.moveTo(x, y);
  }
  lineTo(x: number, y: number): void {
    this.ctx.lineTo(x, y);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.ctx.quadraticCurveTo(cx, cy, x, y);
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
  }
  rect(x: number, y: number, width: number, height: number): void {
    this.ctx.rect(x, y, width, height);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number): void {
    this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }

  // --- Fill / stroke ---

  fill(rule?: FillRule): void {
    this.ctx.fill(rule);
  }
  stroke(): void {
    this.ctx.stroke();
  }

  // --- Text ---

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    if (maxWidth !== undefined) this.ctx.fillText(text, x, y, maxWidth);
    else this.ctx.fillText(text, x, y);
  }
  measureText(text: string): { width: number } {
    const m = this.ctx.measureText(text);
    return { width: m.width };
  }

  // --- Images ---

  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number, _dynamic?: boolean): void {
    // `_dynamic` ignored — Canvas2D reads the source element live on
    // every drawImage, so animated GIF / video frames are picked up
    // automatically as long as the host re-renders (AnimationTick).
    void _dynamic;
    // Guard against non-drawable handles. A restored scene carries
    // either a string `src` (dead blob: URL) OR a `metadata.image`
    // that serialised to `{}` (a live `<img>` becomes an empty object
    // through JSON). Both throw inside `ctx.drawImage`. Skip rather
    // than crash the whole render pass, and surface it once so hosts
    // know an image didn't render (and why).
    if (!isDrawableImageSource(image)) {
      warnSkippedImage(image);
      return;
    }
    this.ctx.drawImage(image, dx, dy, dw, dh);
  }

  // --- Surface control ---

  clear(bounds?: Bounds): void {
    // A `clear()` always opens a fresh dirty pass — the host took
    // responsibility for the cleared region, anything we accumulate
    // from here is the new frame's coverage.
    this.dirtyRect = null;
    if (bounds) {
      this.ctx.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
    } else {
      // Clear the entire CSS-space area, regardless of current transform.
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
      this.ctx.restore();
    }
  }

  // --- Per-pass dirty accumulator ---

  /**
   * Screen-space union of every `markDirty(bounds)` call since the
   * last `clear()`. Hosts can read it via `getDirtyRect()` to size
   * the next clear precisely — covers anti-aliased stroke fuzz and
   * shape renderers that paint a few px beyond their geometric bbox.
   */
  private dirtyRect: Bounds | null = null;

  markDirty(bounds: Bounds): void {
    if (!this.dirtyRect) {
      this.dirtyRect = bounds;
      return;
    }
    const minX = Math.min(this.dirtyRect.x, bounds.x);
    const minY = Math.min(this.dirtyRect.y, bounds.y);
    const maxX = Math.max(
      this.dirtyRect.x + this.dirtyRect.width,
      bounds.x + bounds.width,
    );
    const maxY = Math.max(
      this.dirtyRect.y + this.dirtyRect.height,
      bounds.y + bounds.height,
    );
    this.dirtyRect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /** Read the accumulated dirty rect for this pass. `null` when nothing painted. */
  getDirtyRect(): Bounds | null {
    return this.dirtyRect;
  }
}
