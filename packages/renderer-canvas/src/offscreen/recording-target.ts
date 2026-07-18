import type { Bounds, Color, Transform } from "@oh-just-another/types";
import {
  LruCache,
  type FillRule,
  type LineCap,
  type LineJoin,
  type RenderTarget,
  type TextAlign,
  type TextBaseline,
} from "@oh-just-another/renderer-core";
import { resolveBundledFamily } from "@oh-just-another/fonts";
import { OFFSCREEN_IMAGE_CACHE_CAP } from "../constants.js";
import { intrinsicImageSize, isDrawableImageSource } from "../canvas2d/image-source.js";

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

/**
 * Seed / mixing constants for {@link RecordingTarget}'s rolling content
 * signature. Two 32-bit halves give a ~64-bit hash: the offscreen surface
 * compares it to skip re-posting a layer whose command stream is identical
 * to the frame it last shipped. Collision odds (~2⁻⁶⁴) are far below any
 * frame budget — a miss would only defer one layer's repaint to the next
 * genuine change. The exact values are arbitrary large odd words.
 */
const SIG_SEED_A = 0x811c9dc5 | 0;
const SIG_SEED_B = (0x811c9dc5 ^ 0x9e3779b9) | 0;
const SIG_PRIME_A = 0x01000193;
const SIG_PRIME_B = 0x85ebca6b;
const SIG_ROT = 0x9e3779b9 | 0;
const SIG_NIL = 0x7fff_ffff;
const SIG_ARR = 0x5555_5555;
/** Shared scratch view to read a float's exact IEEE-754 bits. */
const SIG_F64 = new Float64Array(1);
const SIG_I32 = new Int32Array(SIG_F64.buffer);

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
      readonly k: "defineImage";
      readonly id: number;
      readonly bitmap: ImageBitmap;
      /**
       * Capture generation for re-captured dynamic sources (video frames):
       * bumps every snapshot so the content signature changes and the
       * offscreen surface reposts the frame. Absent for interned statics.
       */
      readonly gen?: number;
    }
  | {
      readonly k: "drawImage";
      readonly id: number;
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
 * To avoid re-shipping the same bitmap every frame (the offscreen path
 * re-renders each frame so GIF / video advance), bitmaps are interned by
 * identity to a stable numeric id: the first draw emits a `defineImage`
 * carrying the bitmap, later draws of the same bitmap emit only a tiny
 * `drawImage` referencing the id. An LRU bounds the live set; the worker
 * mirrors the same-capacity LRU, so both evict the same id in lockstep.
 *
 * `measureText` measures on a hidden 2D context with the active font, so
 * caret / selection geometry lines up with the text the worker draws —
 * without routing each call across the worker boundary.
 */
export class RecordingTarget implements RenderTarget {
  private commands: RenderCommand[] = [];
  private _width: number;
  private _height: number;
  /** Counter so hosts can warn when images are silently skipped. */
  skippedImageDraws = 0;
  /** Current font as a CSS shorthand, mirrored from `setFont` for `measureText`. */
  private fontSpec = "10px sans-serif";
  /** Hidden 2D context used to measure text with the active font. */
  private measureCtx: CanvasRenderingContext2D | null = null;
  /**
   * Identity → id intern table for shipped bitmaps. Persists across
   * `flush()` (the worker keeps its mirror across replays); bounded by an
   * LRU of {@link OFFSCREEN_IMAGE_CACHE_CAP} so a long animation can't grow
   * it without bound. Ids are monotonic and never reused, so an evicted
   * bitmap that reappears is simply re-defined under a fresh id.
   */
  private readonly imageIds = new LruCache<object, number>(OFFSCREEN_IMAGE_CACHE_CAP);
  /** Monotonic generation counter for re-captured dynamic frames. */
  private captureGen = 0;
  /** Scratch canvas reused to snapshot non-bitmap sources (video frames). */
  private captureCanvas: OffscreenCanvas | null = null;
  private nextImageId = 0;

  /**
   * Rolling 64-bit content signature (two 32-bit halves) of the commands
   * accumulated since the last {@link flush}. Every {@link emit} folds the
   * command's tag and primitive fields in, so two frames that record a
   * byte-identical stream produce the same signature — letting the
   * offscreen surface skip re-posting a layer whose replay would reproduce
   * the pixels the worker already shows. Reset to the seeds on `flush`.
   */
  private sigA = SIG_SEED_A;
  private sigB = SIG_SEED_B;
  private cmdCount = 0;
  /** Signature of the buffer returned by the most recent {@link flush}. */
  private _lastSignature = "";

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
    this.emit({ k: "resize", w: width, h: height });
  }

  /** Buffer one command and fold it into the rolling content signature. */
  private emit(cmd: RenderCommand): void {
    this.commands.push(cmd);
    this.cmdCount++;
    this.mixString(cmd.k);
    for (const key in cmd) {
      if (key === "k") continue;
      this.mixValue((cmd as Record<string, unknown>)[key]);
    }
  }

  /** Fold one 32-bit word into both signature halves (Murmur-style mix). */
  private mix32(x: number): void {
    const w = x | 0;
    this.sigA = (Math.imul(this.sigA ^ w, SIG_PRIME_A) | 0) ^ SIG_ROT;
    this.sigB = Math.imul(this.sigB ^ (w + SIG_ROT), SIG_PRIME_B) | 0;
  }

  /** Fold a number by its exact 64-bit IEEE-754 bit pattern. */
  private mixNumber(n: number): void {
    SIG_F64[0] = n;
    this.mix32(SIG_I32[0] ?? 0);
    this.mix32(SIG_I32[1] ?? 0);
  }

  private mixString(s: string): void {
    for (let i = 0; i < s.length; i++) this.mix32(s.charCodeAt(i));
    // Length terminator so "ab"+"c" and "a"+"bc" don't collide.
    this.mix32(s.length ^ 0x1_0000);
  }

  /**
   * Fold an arbitrary command-field value: numbers by bits, strings by
   * chars, nested `Transform` / bounds / options objects field-by-field,
   * dash arrays element-by-element. `ImageBitmap` pixels are NOT hashed —
   * a bitmap only ever appears in a `defineImage`, whose presence (and the
   * accompanying numeric `id`) already differentiates the stream, so the
   * per-frame `drawImage`-by-id path stays exact without touching pixels.
   */
  private mixValue(v: unknown): void {
    if (v === null || v === undefined) {
      this.mix32(SIG_NIL);
      return;
    }
    switch (typeof v) {
      case "number":
        this.mixNumber(v);
        return;
      case "boolean":
        this.mix32(v ? 1 : 2);
        return;
      case "string":
        this.mixString(v);
        return;
      case "object": {
        if (Array.isArray(v)) {
          for (const e of v) this.mixValue(e);
          this.mix32(v.length ^ SIG_ARR);
          return;
        }
        if (typeof ImageBitmap !== "undefined" && v instanceof ImageBitmap) return;
        for (const k in v as Record<string, unknown>) {
          this.mixValue((v as Record<string, unknown>)[k]);
        }
        return;
      }
      default:
        return;
    }
  }

  /**
   * Content signature of the buffer returned by the most recent
   * {@link flush}. Stable across frames that record an identical command
   * stream; used by the offscreen surface to skip re-posting unchanged
   * layers. Empty string before the first flush.
   */
  get lastSignature(): string {
    return this._lastSignature;
  }

  /** Pop the buffered commands and clear the internal log. */
  flush(): readonly RenderCommand[] {
    const out = this.commands;
    this._lastSignature = `${this.cmdCount}:${(this.sigA >>> 0).toString(36)}:${(
      this.sigB >>> 0
    ).toString(36)}`;
    this.commands = [];
    this.sigA = SIG_SEED_A;
    this.sigB = SIG_SEED_B;
    this.cmdCount = 0;
    return out;
  }

  /** Snapshot of the buffered commands without clearing. */
  peek(): readonly RenderCommand[] {
    return this.commands;
  }

  setFill(color: Color | null): void {
    this.emit({ k: "setFill", color });
  }
  setStroke(color: Color | null): void {
    this.emit({ k: "setStroke", color });
  }
  setStrokeWidth(w: number): void {
    this.emit({ k: "setStrokeWidth", w });
  }
  setOpacity(a: number): void {
    this.emit({ k: "setOpacity", a });
  }
  setLineCap(cap: LineCap): void {
    this.emit({ k: "setLineCap", cap });
  }
  setLineJoin(join: LineJoin): void {
    this.emit({ k: "setLineJoin", join });
  }
  setDashArray(dash: readonly number[] | null): void {
    this.emit({ k: "setDashArray", dash });
  }
  setFont(
    family: string,
    size: number,
    options?: { weight?: "normal" | "bold"; style?: "normal" | "italic" },
  ): void {
    this.emit({ k: "setFont", family, size, ...(options ? { options } : {}) });
    // CSS font shorthand order: `<style> <weight> <size> <family>` — same as
    // the worker's Canvas2D target (bundled face first), so `measureText`
    // matches what it draws.
    const style = options?.style === "italic" ? "italic " : "";
    const weight = options?.weight === "bold" ? "bold " : "";
    this.fontSpec = `${style}${weight}${size}px "${resolveBundledFamily(family)}", ${family}`;
  }
  setTextAlign(align: TextAlign): void {
    this.emit({ k: "setTextAlign", align });
  }
  setTextBaseline(baseline: TextBaseline): void {
    this.emit({ k: "setTextBaseline", baseline });
  }

  save(): void {
    this.emit({ k: "save" });
  }
  restore(): void {
    this.emit({ k: "restore" });
  }

  translate(x: number, y: number): void {
    this.emit({ k: "translate", x, y });
  }
  rotate(r: number): void {
    this.emit({ k: "rotate", r });
  }
  scale(sx: number, sy: number): void {
    this.emit({ k: "scale", sx, sy });
  }
  setTransform(t: Transform): void {
    this.emit({ k: "setTransform", t });
  }
  resetTransform(): void {
    this.emit({ k: "resetTransform" });
  }

  beginPath(): void {
    this.emit({ k: "beginPath" });
  }
  closePath(): void {
    this.emit({ k: "closePath" });
  }
  moveTo(x: number, y: number): void {
    this.emit({ k: "moveTo", x, y });
  }
  lineTo(x: number, y: number): void {
    this.emit({ k: "lineTo", x, y });
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.emit({ k: "quadraticCurveTo", cx, cy, x, y });
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.emit({ k: "bezierCurveTo", c1x, c1y, c2x, c2y, x, y });
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.emit({ k: "rect", x, y, w, h });
  }
  ellipse(cx: number, cy: number, rx: number, ry: number): void {
    this.emit({ k: "ellipse", cx, cy, rx, ry });
  }

  fill(rule?: FillRule): void {
    this.emit(rule !== undefined ? { k: "fill", rule } : { k: "fill" });
  }
  stroke(): void {
    this.emit({ k: "stroke" });
  }

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.emit(
      maxWidth !== undefined
        ? { k: "fillText", text, x, y, maxWidth }
        : { k: "fillText", text, x, y },
    );
  }
  measureText(text: string): { width: number } {
    // Measure on a hidden 2D context with the active font, matching the
    // worker's Canvas2D target — so caret / selection geometry on the
    // offscreen backend lines up with the drawn glyphs. Falls back to a
    // proportional estimate where `OffscreenCanvas` is unavailable.
    const ctx = this.ensureMeasureCtx();
    if (!ctx) return { width: text.length * (Number.parseFloat(this.fontSpec) || 8) * 0.5 };
    ctx.font = this.fontSpec;
    return { width: ctx.measureText(text).width };
  }

  private ensureMeasureCtx(): CanvasRenderingContext2D | null {
    if (this.measureCtx) return this.measureCtx;
    if (typeof OffscreenCanvas === "undefined") return null;
    const ctx = new OffscreenCanvas(1, 1).getContext("2d");
    // OffscreenCanvasRenderingContext2D is structurally compatible with the
    // `font` / `measureText` members used here.
    this.measureCtx = (ctx as unknown as CanvasRenderingContext2D | null) ?? null;
    return this.measureCtx;
  }

  drawImage(
    image: unknown,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    dynamic?: boolean,
  ): void {
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
      let id = this.imageIds.get(image);
      if (id === undefined) {
        // First sight of this bitmap (or it was evicted): assign a fresh
        // id and ship the pixels once via `defineImage`.
        id = this.nextImageId++;
        this.imageIds.set(image, id);
        this.emit({ k: "defineImage", id, bitmap: image });
      }
      this.emit({ k: "drawImage", id, dx, dy, dw, dh });
      return;
    }
    if (isDrawableImageSource(image)) {
      // Non-bitmap drawable (a <video> frame, <img>, canvas): the worker
      // can't touch DOM elements, so snapshot the CURRENT pixels into an
      // ImageBitmap it can own. Statics intern by source identity (captured
      // once); dynamic sources (video, animated <img>) re-capture on every
      // draw and re-define under the SAME id — the `gen` bump makes the
      // signature differ so the frame reposts, and the worker closes the
      // replaced bitmap.
      let id = this.imageIds.get(image);
      if (id === undefined || dynamic === true) {
        const bitmap = this.captureBitmap(image);
        if (!bitmap) {
          this.skippedImageDraws++;
          return;
        }
        if (id === undefined) {
          id = this.nextImageId++;
          this.imageIds.set(image, id);
        }
        this.emit({ k: "defineImage", id, bitmap, gen: ++this.captureGen });
      }
      this.emit({ k: "drawImage", id, dx, dy, dw, dh });
      return;
    }
    this.skippedImageDraws++;
  }

  /**
   * Synchronously snapshot a drawable source's current pixels into an
   * ImageBitmap via a reused scratch OffscreenCanvas
   * (`transferToImageBitmap` detaches the backing store, so the canvas is
   * cheap to keep around). Returns `null` when the source has no pixels yet
   * (a <video> before its first frame) or the environment lacks
   * OffscreenCanvas.
   */
  private captureBitmap(source: CanvasImageSource): ImageBitmap | null {
    if (typeof OffscreenCanvas === "undefined") return null;
    const size = intrinsicImageSize(source);
    if (!size || size.width <= 0 || size.height <= 0) return null;
    // HAVE_CURRENT_DATA (2) is the earliest state with drawable pixels.
    const video = source as Partial<HTMLVideoElement>;
    if (typeof video.readyState === "number" && video.readyState < 2) return null;
    this.captureCanvas ??= new OffscreenCanvas(size.width, size.height);
    const canvas = this.captureCanvas;
    if (canvas.width !== size.width || canvas.height !== size.height) {
      canvas.width = size.width;
      canvas.height = size.height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.drawImage(source, 0, 0);
    return canvas.transferToImageBitmap();
  }

  clear(bounds?: Bounds): void {
    this.emit(bounds !== undefined ? { k: "clear", bounds } : { k: "clear" });
  }

  markDirty(bounds: Bounds): void {
    this.emit({ k: "markDirty", bounds });
  }
}

/**
 * Replay a previously-flushed command buffer onto a real RenderTarget.
 * Used by the worker entry point to apply commands shipped from the
 * main thread.
 *
 * `images` holds the bitmaps interned by {@link RecordingTarget}: a
 * `defineImage` stores one under its id, a `drawImage` looks it up. The
 * caller (worker) owns this cache so it survives across replays and
 * mirrors the recorder's same-capacity LRU. When omitted (callers with
 * no image commands) a throwaway cache is used.
 */
export const replayCommands = (
  target: RenderTarget,
  commands: readonly RenderCommand[],
  images: LruCache<number, ImageBitmap> = new LruCache(OFFSCREEN_IMAGE_CACHE_CAP),
): void => {
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
      case "defineImage": {
        // Re-defining an id (re-captured video frame) replaces the stored
        // bitmap; close the old clone so worker memory doesn't leak
        // (LruCache.set does not fire onEvict for an overwrite).
        const prev = images.get(cmd.id);
        if (prev && prev !== cmd.bitmap) prev.close();
        images.set(cmd.id, cmd.bitmap);
        break;
      }
      case "drawImage": {
        // `get` bumps recency so the worker LRU evicts in lockstep with
        // the recorder's. A miss means an out-of-sync stream — skip
        // rather than throw (matches the non-drawable skip on record).
        const bitmap = images.get(cmd.id);
        if (bitmap) target.drawImage(bitmap, cmd.dx, cmd.dy, cmd.dw, cmd.dh);
        break;
      }
    }
  }
};
