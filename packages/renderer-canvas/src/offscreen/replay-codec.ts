import type { Bounds } from "@oh-just-another/types";
import {
  LruCache,
  type FillRule,
  type LineCap,
  type LineJoin,
  type RenderTarget,
  type TextAlign,
  type TextBaseline,
} from "@oh-just-another/renderer-core";
import { OFFSCREEN_IMAGE_CACHE_CAP } from "../constants.js";
import type { RenderCommand } from "./recording-target.js";

/**
 * Packed-frame codec for the offscreen backend's per-frame worker hop.
 *
 * `structuredClone`-ing an array of {@link RenderCommand} objects costs
 * ~1.6 ms for a ~4.5k-command frame (see `tests/offscreen-transfer.bench.ts`)
 * — every object, key, and string is walked and copied. This codec flattens
 * the stream into one transferable `ArrayBuffer` of Float64 words (opcode +
 * args per command) plus a per-frame deduplicated string table, so
 * `postMessage` transfers the numeric bulk for free and only clones a small
 * string array. `ImageBitmap` payloads (`defineImage`) travel in a side
 * array — see {@link packReplayFrame}.
 */

/**
 * Opcodes for the packed numeric stream — one per {@link RenderCommand}
 * variant except `defineImage`, which travels in the side bitmap array and
 * emits nothing here. Wire format only: values are arbitrary but must stay
 * in sync between {@link packReplayFrame} and {@link replayPackedFrame}
 * (same-package protocol; both sides always ship together).
 */
const OP_SET_FILL = 0;
const OP_SET_STROKE = 1;
const OP_SET_STROKE_WIDTH = 2;
const OP_SET_OPACITY = 3;
const OP_SET_LINE_CAP = 4;
const OP_SET_LINE_JOIN = 5;
const OP_SET_DASH_ARRAY = 6;
const OP_SET_FONT = 7;
const OP_SET_TEXT_ALIGN = 8;
const OP_SET_TEXT_BASELINE = 9;
const OP_SAVE = 10;
const OP_RESTORE = 11;
const OP_TRANSLATE = 12;
const OP_ROTATE = 13;
const OP_SCALE = 14;
const OP_SET_TRANSFORM = 15;
const OP_RESET_TRANSFORM = 16;
const OP_BEGIN_PATH = 17;
const OP_CLOSE_PATH = 18;
const OP_MOVE_TO = 19;
const OP_LINE_TO = 20;
const OP_QUADRATIC_CURVE_TO = 21;
const OP_BEZIER_CURVE_TO = 22;
const OP_RECT = 23;
const OP_ELLIPSE = 24;
const OP_FILL = 25;
const OP_STROKE = 26;
const OP_FILL_TEXT = 27;
const OP_CLEAR = 28;
const OP_MARK_DIRTY = 29;
const OP_RESIZE = 30;
const OP_DRAW_IMAGE = 31;
const OP_CLIP = 32;

/**
 * String-table index sentinel for a `null` color (`setFill` / `setStroke`
 * accept `Color | null`). Real indices are >= 0.
 */
const NULL_STRING_INDEX = -1;

/** `setDashArray(null)` marker written in place of the dash length. */
const NULL_DASH_LENGTH = -1;

/**
 * Enum wire codes. Encode side uses the `*_CODE` records, decode side the
 * positional arrays — index === code. Order is wire format; append only.
 */
const LINE_CAPS: readonly LineCap[] = ["butt", "round", "square"];
const LINE_CAP_CODE: Record<LineCap, number> = { butt: 0, round: 1, square: 2 };
const LINE_JOINS: readonly LineJoin[] = ["miter", "round", "bevel"];
const LINE_JOIN_CODE: Record<LineJoin, number> = { miter: 0, round: 1, bevel: 2 };
const TEXT_ALIGNS: readonly TextAlign[] = ["left", "center", "right"];
const TEXT_ALIGN_CODE: Record<TextAlign, number> = { left: 0, center: 1, right: 2 };
const TEXT_BASELINES: readonly TextBaseline[] = ["top", "middle", "bottom"];
const TEXT_BASELINE_CODE: Record<TextBaseline, number> = { top: 0, middle: 1, bottom: 2 };

/**
 * `fill(rule?)` wire codes: 0 = no rule argument, 1 = "nonzero",
 * 2 = "evenodd".
 */
const FILL_RULE_CODE: Record<FillRule, number> = { nonzero: 1, evenodd: 2 };

/**
 * `setFont` options wire codes. 0 = key absent from the options object;
 * 1 / 2 = the two allowed values. A separate leading flag word (0 / 1)
 * distinguishes "no options argument at all" from an empty options object.
 */
const FONT_WEIGHT_CODE: Record<"normal" | "bold", number> = { normal: 1, bold: 2 };
const FONT_STYLE_CODE: Record<"normal" | "italic", number> = { normal: 1, italic: 2 };

/** Optional-argument presence flags (`fillText` maxWidth, `clear` bounds). */
const ABSENT = 0;
const PRESENT = 1;

/**
 * Initial capacity (in Float64 words) of the packed stream, as a multiple
 * of the command count. Most commands fit in opcode + ≤6 args; the writer
 * doubles on overflow, so this only tunes how often the first frames
 * reallocate.
 */
const PACK_WORDS_PER_COMMAND = 4;

/** Floor for the writer's initial capacity so tiny frames don't thrash. */
const PACK_MIN_CAPACITY = 64;

/** One `defineImage` payload carried alongside the numeric stream. */
export interface PackedFrameBitmap {
  readonly id: number;
  readonly bitmap: ImageBitmap;
}

/**
 * Result of {@link packReplayFrame}: `buffer` is the transferable numeric
 * stream, `strings` the per-frame deduplicated string table it indexes
 * into, `bitmaps` the `defineImage` payloads (worker registers them BEFORE
 * replaying the stream).
 */
export interface PackedReplayFrame {
  readonly buffer: ArrayBuffer;
  readonly strings: readonly string[];
  readonly bitmaps: readonly PackedFrameBitmap[];
}

/**
 * postMessage shape the offscreen surface posts per changed layer and the
 * render worker consumes. `buffer` goes in the transfer list; `strings`
 * are cloned (cheap — deduplicated); `bitmaps` are CLONED, never
 * transferred — see {@link packReplayFrame}.
 */
export interface PackedReplayMessage {
  readonly type: "replay";
  readonly buffer: ArrayBuffer;
  readonly strings: readonly string[];
  readonly bitmaps: readonly PackedFrameBitmap[];
}

/**
 * Flatten a flushed {@link RenderCommand} buffer into a transferable packed
 * frame: one Float64 word per opcode / argument, strings deduplicated into
 * a side table, enums and presence flags as small ints.
 *
 * `defineImage` commands emit nothing into the numeric stream; their
 * `{ id, bitmap }` payloads are collected into `bitmaps` instead. The
 * caller must post them WITHOUT a transfer-list entry so `postMessage`
 * clones the pixels: the recorder's intern LRU still owns the source
 * bitmap and will keep drawing it on later frames (GIF / video), so
 * transferring (detaching) it would break the main thread's copy.
 */
export const packReplayFrame = (commands: readonly RenderCommand[]): PackedReplayFrame => {
  let words = new Float64Array(
    Math.max(PACK_MIN_CAPACITY, commands.length * PACK_WORDS_PER_COMMAND),
  );
  let used = 0;
  const push = (v: number): void => {
    if (used === words.length) {
      const grown = new Float64Array(words.length * 2);
      grown.set(words);
      words = grown;
    }
    words[used++] = v;
  };

  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  /** Dedup a string through the per-frame table, returning its index. */
  const intern = (s: string): number => {
    let idx = stringIndex.get(s);
    if (idx === undefined) {
      idx = strings.length;
      strings.push(s);
      stringIndex.set(s, idx);
    }
    return idx;
  };

  const bitmaps: PackedFrameBitmap[] = [];

  for (const cmd of commands) {
    switch (cmd.k) {
      case "setFill":
        push(OP_SET_FILL);
        push(cmd.color === null ? NULL_STRING_INDEX : intern(cmd.color));
        break;
      case "setStroke":
        push(OP_SET_STROKE);
        push(cmd.color === null ? NULL_STRING_INDEX : intern(cmd.color));
        break;
      case "setStrokeWidth":
        push(OP_SET_STROKE_WIDTH);
        push(cmd.w);
        break;
      case "setOpacity":
        push(OP_SET_OPACITY);
        push(cmd.a);
        break;
      case "setLineCap":
        push(OP_SET_LINE_CAP);
        push(LINE_CAP_CODE[cmd.cap]);
        break;
      case "setLineJoin":
        push(OP_SET_LINE_JOIN);
        push(LINE_JOIN_CODE[cmd.join]);
        break;
      case "setDashArray":
        push(OP_SET_DASH_ARRAY);
        if (cmd.dash === null) {
          push(NULL_DASH_LENGTH);
        } else {
          push(cmd.dash.length);
          for (const d of cmd.dash) push(d);
        }
        break;
      case "setFont":
        push(OP_SET_FONT);
        push(intern(cmd.family));
        push(cmd.size);
        if (cmd.options === undefined) {
          push(ABSENT);
        } else {
          push(PRESENT);
          push(cmd.options.weight === undefined ? 0 : FONT_WEIGHT_CODE[cmd.options.weight]);
          push(cmd.options.style === undefined ? 0 : FONT_STYLE_CODE[cmd.options.style]);
        }
        break;
      case "setTextAlign":
        push(OP_SET_TEXT_ALIGN);
        push(TEXT_ALIGN_CODE[cmd.align]);
        break;
      case "setTextBaseline":
        push(OP_SET_TEXT_BASELINE);
        push(TEXT_BASELINE_CODE[cmd.baseline]);
        break;
      case "save":
        push(OP_SAVE);
        break;
      case "restore":
        push(OP_RESTORE);
        break;
      case "translate":
        push(OP_TRANSLATE);
        push(cmd.x);
        push(cmd.y);
        break;
      case "rotate":
        push(OP_ROTATE);
        push(cmd.r);
        break;
      case "scale":
        push(OP_SCALE);
        push(cmd.sx);
        push(cmd.sy);
        break;
      case "setTransform":
        push(OP_SET_TRANSFORM);
        push(cmd.t.a);
        push(cmd.t.b);
        push(cmd.t.c);
        push(cmd.t.d);
        push(cmd.t.e);
        push(cmd.t.f);
        break;
      case "resetTransform":
        push(OP_RESET_TRANSFORM);
        break;
      case "beginPath":
        push(OP_BEGIN_PATH);
        break;
      case "closePath":
        push(OP_CLOSE_PATH);
        break;
      case "moveTo":
        push(OP_MOVE_TO);
        push(cmd.x);
        push(cmd.y);
        break;
      case "lineTo":
        push(OP_LINE_TO);
        push(cmd.x);
        push(cmd.y);
        break;
      case "quadraticCurveTo":
        push(OP_QUADRATIC_CURVE_TO);
        push(cmd.cx);
        push(cmd.cy);
        push(cmd.x);
        push(cmd.y);
        break;
      case "bezierCurveTo":
        push(OP_BEZIER_CURVE_TO);
        push(cmd.c1x);
        push(cmd.c1y);
        push(cmd.c2x);
        push(cmd.c2y);
        push(cmd.x);
        push(cmd.y);
        break;
      case "rect":
        push(OP_RECT);
        push(cmd.x);
        push(cmd.y);
        push(cmd.w);
        push(cmd.h);
        break;
      case "ellipse":
        push(OP_ELLIPSE);
        push(cmd.cx);
        push(cmd.cy);
        push(cmd.rx);
        push(cmd.ry);
        break;
      case "fill":
        push(OP_FILL);
        push(cmd.rule === undefined ? ABSENT : FILL_RULE_CODE[cmd.rule]);
        break;
      case "clip":
        push(OP_CLIP);
        push(cmd.rule === undefined ? ABSENT : FILL_RULE_CODE[cmd.rule]);
        break;
      case "stroke":
        push(OP_STROKE);
        break;
      case "fillText":
        push(OP_FILL_TEXT);
        push(intern(cmd.text));
        push(cmd.x);
        push(cmd.y);
        if (cmd.maxWidth === undefined) {
          push(ABSENT);
        } else {
          push(PRESENT);
          push(cmd.maxWidth);
        }
        break;
      case "clear":
        push(OP_CLEAR);
        if (cmd.bounds === undefined) {
          push(ABSENT);
        } else {
          push(PRESENT);
          push(cmd.bounds.x);
          push(cmd.bounds.y);
          push(cmd.bounds.width);
          push(cmd.bounds.height);
        }
        break;
      case "markDirty":
        push(OP_MARK_DIRTY);
        push(cmd.bounds.x);
        push(cmd.bounds.y);
        push(cmd.bounds.width);
        push(cmd.bounds.height);
        break;
      case "resize":
        push(OP_RESIZE);
        push(cmd.w);
        push(cmd.h);
        break;
      case "defineImage":
        // Not packed: the bitmap travels beside the numeric stream. The
        // worker registers all side bitmaps before replaying, so the
        // stream's `drawImage` id references always resolve.
        bitmaps.push({ id: cmd.id, bitmap: cmd.bitmap });
        break;
      case "drawImage":
        push(OP_DRAW_IMAGE);
        push(cmd.id);
        push(cmd.dx);
        push(cmd.dy);
        push(cmd.dw);
        push(cmd.dh);
        break;
    }
  }

  // Exact-size copy so the transferred buffer carries no slack capacity.
  return { buffer: words.slice(0, used).buffer, strings, bitmaps };
};

/**
 * Decode a packed frame and dispatch each command straight onto `target`
 * in one pass — no intermediate {@link RenderCommand} objects.
 *
 * `images` is the worker's persistent id → bitmap LRU (mirrors the
 * recorder's same-capacity intern LRU): the caller must have registered
 * the frame's side bitmaps into it BEFORE calling. Semantics match
 * {@link replayCommands}: `resize` is a no-op (the worker owns the canvas
 * size via its own `resize` message) and a `drawImage` whose id misses the
 * cache is skipped rather than thrown.
 */
export const replayPackedFrame = (
  target: RenderTarget,
  buffer: ArrayBuffer,
  strings: readonly string[],
  images: LruCache<number, ImageBitmap> = new LruCache(OFFSCREEN_IMAGE_CACHE_CAP),
): void => {
  const words = new Float64Array(buffer);
  let i = 0;
  const next = (): number => {
    const v = words[i++];
    if (v === undefined) throw new Error("replayPackedFrame: truncated stream");
    return v;
  };
  const str = (idx: number): string => {
    const s = strings[idx];
    if (s === undefined) throw new Error(`replayPackedFrame: bad string index ${String(idx)}`);
    return s;
  };
  const at = <T>(table: readonly T[], code: number): T => {
    const v = table[code];
    if (v === undefined) throw new Error(`replayPackedFrame: bad enum code ${String(code)}`);
    return v;
  };

  while (i < words.length) {
    const op = next();
    switch (op) {
      case OP_SET_FILL: {
        const idx = next();
        target.setFill(idx === NULL_STRING_INDEX ? null : str(idx));
        break;
      }
      case OP_SET_STROKE: {
        const idx = next();
        target.setStroke(idx === NULL_STRING_INDEX ? null : str(idx));
        break;
      }
      case OP_SET_STROKE_WIDTH:
        target.setStrokeWidth(next());
        break;
      case OP_SET_OPACITY:
        target.setOpacity(next());
        break;
      case OP_SET_LINE_CAP:
        target.setLineCap(at(LINE_CAPS, next()));
        break;
      case OP_SET_LINE_JOIN:
        target.setLineJoin(at(LINE_JOINS, next()));
        break;
      case OP_SET_DASH_ARRAY: {
        const n = next();
        if (n === NULL_DASH_LENGTH) {
          target.setDashArray(null);
        } else {
          const dash: number[] = [];
          for (let d = 0; d < n; d++) dash.push(next());
          target.setDashArray(dash);
        }
        break;
      }
      case OP_SET_FONT: {
        const family = str(next());
        const size = next();
        if (next() === ABSENT) {
          target.setFont(family, size);
          break;
        }
        const weight = next();
        const style = next();
        const options: { weight?: "normal" | "bold"; style?: "normal" | "italic" } = {};
        if (weight === FONT_WEIGHT_CODE.normal) options.weight = "normal";
        else if (weight === FONT_WEIGHT_CODE.bold) options.weight = "bold";
        if (style === FONT_STYLE_CODE.normal) options.style = "normal";
        else if (style === FONT_STYLE_CODE.italic) options.style = "italic";
        target.setFont(family, size, options);
        break;
      }
      case OP_SET_TEXT_ALIGN:
        target.setTextAlign(at(TEXT_ALIGNS, next()));
        break;
      case OP_SET_TEXT_BASELINE:
        target.setTextBaseline(at(TEXT_BASELINES, next()));
        break;
      case OP_SAVE:
        target.save();
        break;
      case OP_RESTORE:
        target.restore();
        break;
      case OP_TRANSLATE:
        target.translate(next(), next());
        break;
      case OP_ROTATE:
        target.rotate(next());
        break;
      case OP_SCALE:
        target.scale(next(), next());
        break;
      case OP_SET_TRANSFORM:
        target.setTransform({
          a: next(),
          b: next(),
          c: next(),
          d: next(),
          e: next(),
          f: next(),
        });
        break;
      case OP_RESET_TRANSFORM:
        target.resetTransform();
        break;
      case OP_BEGIN_PATH:
        target.beginPath();
        break;
      case OP_CLOSE_PATH:
        target.closePath();
        break;
      case OP_MOVE_TO:
        target.moveTo(next(), next());
        break;
      case OP_LINE_TO:
        target.lineTo(next(), next());
        break;
      case OP_QUADRATIC_CURVE_TO:
        target.quadraticCurveTo(next(), next(), next(), next());
        break;
      case OP_BEZIER_CURVE_TO:
        target.bezierCurveTo(next(), next(), next(), next(), next(), next());
        break;
      case OP_RECT:
        target.rect(next(), next(), next(), next());
        break;
      case OP_ELLIPSE:
        target.ellipse(next(), next(), next(), next());
        break;
      case OP_FILL: {
        const code = next();
        if (code === FILL_RULE_CODE.nonzero) target.fill("nonzero");
        else if (code === FILL_RULE_CODE.evenodd) target.fill("evenodd");
        else target.fill();
        break;
      }
      case OP_STROKE:
        target.stroke();
        break;
      case OP_CLIP: {
        const code = next();
        if (code === FILL_RULE_CODE.nonzero) target.clip("nonzero");
        else if (code === FILL_RULE_CODE.evenodd) target.clip("evenodd");
        else target.clip();
        break;
      }
      case OP_FILL_TEXT: {
        const text = str(next());
        const x = next();
        const y = next();
        if (next() === PRESENT) target.fillText(text, x, y, next());
        else target.fillText(text, x, y);
        break;
      }
      case OP_CLEAR:
        if (next() === PRESENT) {
          const bounds: Bounds = { x: next(), y: next(), width: next(), height: next() };
          target.clear(bounds);
        } else {
          target.clear();
        }
        break;
      case OP_MARK_DIRTY:
        target.markDirty?.({ x: next(), y: next(), width: next(), height: next() });
        break;
      case OP_RESIZE:
        // No-op for replay — the worker owns the canvas size and resizes
        // via its own `resize` message, not via the command stream. Still
        // consume the args to stay in sync with the stream.
        next();
        next();
        break;
      case OP_DRAW_IMAGE: {
        // `get` bumps recency so the worker LRU evicts in lockstep with
        // the recorder's. A miss means an out-of-sync stream — skip
        // rather than throw (matches the non-drawable skip on record).
        const id = next();
        const dx = next();
        const dy = next();
        const dw = next();
        const dh = next();
        const bitmap = images.get(id);
        if (bitmap) target.drawImage(bitmap, dx, dy, dw, dh);
        break;
      }
      default:
        throw new Error(`replayPackedFrame: unknown opcode ${String(op)}`);
    }
  }
};
