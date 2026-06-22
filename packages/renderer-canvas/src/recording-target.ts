import type { Bounds, Color, Transform } from "@oh-just-another/types";
import type {
  FillRule,
  LineCap,
  LineJoin,
  RenderTarget,
  TextAlign,
  TextBaseline,
} from "@oh-just-another/renderer-core";

/**
 * Backend-agnostic RenderTarget that captures every method call as a
 * structured command. Powers the "offscreen" pipeline: the main thread
 * renders into a RecordingTarget, the resulting buffer is shipped to a
 * worker via postMessage, and the worker replays the commands onto its
 * OffscreenCanvas.
 *
 * Commands are a tagged union of primitive payloads (no class
 * instances) so they survive `structuredClone` cleanly across the
 * worker boundary. `flush()` returns the buffered commands and resets
 * the internal log.
 */

export type RenderCommand =
  | { readonly k: "setFill"; readonly color: Color | null }
  | { readonly k: "setStroke"; readonly color: Color | null }
  | { readonly k: "setStrokeWidth"; readonly w: number }
  | { readonly k: "setOpacity"; readonly a: number }
  | { readonly k: "setLineCap"; readonly cap: LineCap }
  | { readonly k: "setLineJoin"; readonly join: LineJoin }
  | { readonly k: "setDashArray"; readonly dash: readonly number[] | null }
  | {
      readonly k: "setFont";
      readonly family: string;
      readonly size: number;
      readonly options?: {
        readonly weight?: "normal" | "bold";
        readonly style?: "normal" | "italic";
      };
    }
  | { readonly k: "setTextAlign"; readonly align: TextAlign }
  | { readonly k: "setTextBaseline"; readonly baseline: TextBaseline }
  | { readonly k: "save" }
  | { readonly k: "restore" }
  | { readonly k: "translate"; readonly x: number; readonly y: number }
  | { readonly k: "rotate"; readonly r: number }
  | { readonly k: "scale"; readonly sx: number; readonly sy: number }
  | { readonly k: "setTransform"; readonly t: Transform }
  | { readonly k: "resetTransform" }
  | { readonly k: "beginPath" }
  | { readonly k: "closePath" }
  | { readonly k: "moveTo"; readonly x: number; readonly y: number }
  | { readonly k: "lineTo"; readonly x: number; readonly y: number }
  | {
      readonly k: "quadraticCurveTo";
      readonly cx: number;
      readonly cy: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly k: "bezierCurveTo";
      readonly c1x: number;
      readonly c1y: number;
      readonly c2x: number;
      readonly c2y: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly k: "rect";
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
    }
  | {
      readonly k: "ellipse";
      readonly cx: number;
      readonly cy: number;
      readonly rx: number;
      readonly ry: number;
    }
  | { readonly k: "fill"; readonly rule?: FillRule }
  | { readonly k: "stroke" }
  | {
      readonly k: "fillText";
      readonly text: string;
      readonly x: number;
      readonly y: number;
      readonly maxWidth?: number;
    }
  | { readonly k: "clear"; readonly bounds?: Bounds }
  | { readonly k: "markDirty"; readonly bounds: Bounds }
  | { readonly k: "resize"; readonly w: number; readonly h: number }
  | {
      readonly k: "drawImage";
      readonly bitmap: ImageBitmap;
      readonly dx: number;
      readonly dy: number;
      readonly dw: number;
      readonly dh: number;
    };

/**
 * `drawImage` records `ImageBitmap` sources — they survive the
 * postMessage boundary and are replayed onto the worker's canvas. Other
 * source types (HTMLImageElement, HTMLCanvasElement) are skipped and
 * counted in `skippedImageDraws` so the host UI can warn (or fall back
 * to main-thread compositing for image-heavy scenes).
 *
 * `measureText` returns a synchronous heuristic — routing each call to
 * the worker's authoritative measurement is too chatty. Hosts that care
 * about pixel-perfect text in offscreen mode should pre-measure on a
 * sidecar text shaper.
 */
export class RecordingTarget implements RenderTarget {
  private commands: RenderCommand[] = [];
  private _width: number;
  private _height: number;
  /** Counter so hosts can warn when images are silently skipped. */
  skippedImageDraws = 0;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
  }

  get size(): { readonly width: number; readonly height: number } {
    return { width: this._width, height: this._height };
  }

  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this.commands.push({ k: "resize", w: width, h: height });
  }

  /** Pop the buffered commands and clear the internal log. */
  flush(): readonly RenderCommand[] {
    const out = this.commands;
    this.commands = [];
    return out;
  }

  /** Snapshot of the buffered commands without clearing. */
  peek(): readonly RenderCommand[] {
    return this.commands;
  }

  setFill(color: Color | null): void {
    this.commands.push({ k: "setFill", color });
  }
  setStroke(color: Color | null): void {
    this.commands.push({ k: "setStroke", color });
  }
  setStrokeWidth(w: number): void {
    this.commands.push({ k: "setStrokeWidth", w });
  }
  setOpacity(a: number): void {
    this.commands.push({ k: "setOpacity", a });
  }
  setLineCap(cap: LineCap): void {
    this.commands.push({ k: "setLineCap", cap });
  }
  setLineJoin(join: LineJoin): void {
    this.commands.push({ k: "setLineJoin", join });
  }
  setDashArray(dash: readonly number[] | null): void {
    this.commands.push({ k: "setDashArray", dash });
  }
  setFont(
    family: string,
    size: number,
    options?: { weight?: "normal" | "bold"; style?: "normal" | "italic" },
  ): void {
    this.commands.push({ k: "setFont", family, size, ...(options ? { options } : {}) });
  }
  setTextAlign(align: TextAlign): void {
    this.commands.push({ k: "setTextAlign", align });
  }
  setTextBaseline(baseline: TextBaseline): void {
    this.commands.push({ k: "setTextBaseline", baseline });
  }

  save(): void {
    this.commands.push({ k: "save" });
  }
  restore(): void {
    this.commands.push({ k: "restore" });
  }

  translate(x: number, y: number): void {
    this.commands.push({ k: "translate", x, y });
  }
  rotate(r: number): void {
    this.commands.push({ k: "rotate", r });
  }
  scale(sx: number, sy: number): void {
    this.commands.push({ k: "scale", sx, sy });
  }
  setTransform(t: Transform): void {
    this.commands.push({ k: "setTransform", t });
  }
  resetTransform(): void {
    this.commands.push({ k: "resetTransform" });
  }

  beginPath(): void {
    this.commands.push({ k: "beginPath" });
  }
  closePath(): void {
    this.commands.push({ k: "closePath" });
  }
  moveTo(x: number, y: number): void {
    this.commands.push({ k: "moveTo", x, y });
  }
  lineTo(x: number, y: number): void {
    this.commands.push({ k: "lineTo", x, y });
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.commands.push({ k: "quadraticCurveTo", cx, cy, x, y });
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.commands.push({ k: "bezierCurveTo", c1x, c1y, c2x, c2y, x, y });
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.commands.push({ k: "rect", x, y, w, h });
  }
  ellipse(cx: number, cy: number, rx: number, ry: number): void {
    this.commands.push({ k: "ellipse", cx, cy, rx, ry });
  }

  fill(rule?: FillRule): void {
    this.commands.push(rule !== undefined ? { k: "fill", rule } : { k: "fill" });
  }
  stroke(): void {
    this.commands.push({ k: "stroke" });
  }

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.commands.push(
      maxWidth !== undefined
        ? { k: "fillText", text, x, y, maxWidth }
        : { k: "fillText", text, x, y },
    );
  }
  measureText(text: string): { width: number } {
    // Heuristic so layout stays roughly proportional. Callers that need
    // precise widths re-measure on a real Canvas2D context.
    return { width: text.length * 8 };
  }

  drawImage(
    image: unknown,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    _dynamic?: boolean,
  ): void {
    void _dynamic;
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
      this.commands.push({ k: "drawImage", bitmap: image, dx, dy, dw, dh });
    } else {
      this.skippedImageDraws++;
    }
  }

  clear(bounds?: Bounds): void {
    this.commands.push(bounds !== undefined ? { k: "clear", bounds } : { k: "clear" });
  }

  markDirty(bounds: Bounds): void {
    this.commands.push({ k: "markDirty", bounds });
  }
}

/**
 * Replay a previously-flushed command buffer onto a real RenderTarget.
 * Used by the worker entry point to apply commands shipped from the
 * main thread.
 */
export const replayCommands = (target: RenderTarget, commands: readonly RenderCommand[]): void => {
  for (const cmd of commands) {
    switch (cmd.k) {
      case "setFill":
        target.setFill(cmd.color);
        break;
      case "setStroke":
        target.setStroke(cmd.color);
        break;
      case "setStrokeWidth":
        target.setStrokeWidth(cmd.w);
        break;
      case "setOpacity":
        target.setOpacity(cmd.a);
        break;
      case "setLineCap":
        target.setLineCap(cmd.cap);
        break;
      case "setLineJoin":
        target.setLineJoin(cmd.join);
        break;
      case "setDashArray":
        target.setDashArray(cmd.dash);
        break;
      case "setFont":
        target.setFont(cmd.family, cmd.size, cmd.options);
        break;
      case "setTextAlign":
        target.setTextAlign(cmd.align);
        break;
      case "setTextBaseline":
        target.setTextBaseline(cmd.baseline);
        break;
      case "save":
        target.save();
        break;
      case "restore":
        target.restore();
        break;
      case "translate":
        target.translate(cmd.x, cmd.y);
        break;
      case "rotate":
        target.rotate(cmd.r);
        break;
      case "scale":
        target.scale(cmd.sx, cmd.sy);
        break;
      case "setTransform":
        target.setTransform(cmd.t);
        break;
      case "resetTransform":
        target.resetTransform();
        break;
      case "beginPath":
        target.beginPath();
        break;
      case "closePath":
        target.closePath();
        break;
      case "moveTo":
        target.moveTo(cmd.x, cmd.y);
        break;
      case "lineTo":
        target.lineTo(cmd.x, cmd.y);
        break;
      case "quadraticCurveTo":
        target.quadraticCurveTo(cmd.cx, cmd.cy, cmd.x, cmd.y);
        break;
      case "bezierCurveTo":
        target.bezierCurveTo(cmd.c1x, cmd.c1y, cmd.c2x, cmd.c2y, cmd.x, cmd.y);
        break;
      case "rect":
        target.rect(cmd.x, cmd.y, cmd.w, cmd.h);
        break;
      case "ellipse":
        target.ellipse(cmd.cx, cmd.cy, cmd.rx, cmd.ry);
        break;
      case "fill":
        if (cmd.rule !== undefined) target.fill(cmd.rule);
        else target.fill();
        break;
      case "stroke":
        target.stroke();
        break;
      case "fillText":
        if (cmd.maxWidth !== undefined) target.fillText(cmd.text, cmd.x, cmd.y, cmd.maxWidth);
        else target.fillText(cmd.text, cmd.x, cmd.y);
        break;
      case "clear":
        if (cmd.bounds !== undefined) target.clear(cmd.bounds);
        else target.clear();
        break;
      case "markDirty":
        target.markDirty?.(cmd.bounds);
        break;
      case "resize":
        // No-op for replay — the worker owns the canvas size and
        // resizes via its own `resize` message, not via the command
        // stream.
        break;
      case "drawImage":
        target.drawImage(cmd.bitmap, cmd.dx, cmd.dy, cmd.dw, cmd.dh);
        break;
    }
  }
};
