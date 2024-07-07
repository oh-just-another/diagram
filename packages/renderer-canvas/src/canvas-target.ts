import type { Bounds, Transform } from "@oh-just-another/types";
import type {
  FillRule,
  LineCap,
  LineJoin,
  RenderTarget,
  TextAlign,
  TextBaseline,
} from "@oh-just-another/renderer-core";

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
   * `width` / `height` are CSS-pixel dimensions. The constructor assumes the
   * caller has already configured the canvas bitmap and the context transform
   * for DPR scaling (see `setupHiDpi`).
   */
  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx;
    this._width = width;
    this._height = height;
  }

  get size(): { readonly width: number; readonly height: number } {
    return { width: this._width, height: this._height };
  }

  /** Mutator for callers that resize the canvas. */
  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
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
  setFont(fontFamily: string, fontSize: number): void {
    this.ctx.font = `${fontSize}px ${fontFamily}`;
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
    this.ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
  }
  resetTransform(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
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

  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void {
    this.ctx.drawImage(image as CanvasImageSource, dx, dy, dw, dh);
  }

  // --- Surface control ---

  clear(bounds?: Bounds): void {
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
}
