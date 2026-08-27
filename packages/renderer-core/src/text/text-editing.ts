import type { TextAlign } from "../targets/render-target.js";
import type { TextParagraph } from "@oh-just-another/scene";
import { req, type Vec2 } from "@oh-just-another/types";
import { LIST_INDENT_EM } from "../constants.js";

/**
 * Caret-aware text layout. Unlike {@link wrapText} (which collapses
 * whitespace and is only good enough for *drawing*), this keeps every
 * line as an exact substring of the source plus its `[start, end)`
 * character offsets — so a caret index maps unambiguously to a line +
 * column. Measurement is injected as a `measure(s) => width` callback
 * so the same geometry can be computed against either backend's font
 * metrics (Canvas2D `measureText` or WebGL2 MSDF advances).
 *
 * Convention for `\n`: a hard newline at source index `k` ends the
 * current line at `end === k` (caret at `k` = end of line) and the next
 * line starts at `start === k + 1` (caret at `k + 1` = start of next
 * line). The `\n` itself never holds a caret.
 */
export interface LaidOutLine {
  /** Exact source substring for this visual line (no whitespace collapsing). */
  readonly text: string;
  /** Source offset where the line begins (inclusive). */
  readonly start: number;
  /** Source offset where the line ends (exclusive; excludes a trailing `\n`). */
  readonly end: number;
  /** Measured width of `text` in CSS px. */
  readonly width: number;
  /** List indent offset in CSS px (0 for plain paragraphs). */
  readonly indentX: number;
  /** Index of the source paragraph this line belongs to. */
  readonly para: number;
  /** True on the paragraph's first visual line (where the marker draws). */
  readonly paraFirst: boolean;
}

export interface EditableTextLayout {
  readonly lines: readonly LaidOutLine[];
  readonly lineHeight: number;
  /** Width the lines are aligned within (maxWidth, or the widest line). */
  readonly blockWidth: number;
}

export type MeasureText = (text: string) => number;

export interface LayoutTextOptions {
  readonly fontSize: number;
  /** Wrap budget in CSS px. `undefined` → no wrap (split on `\n` only). */
  readonly maxWidth?: number;
  /** Line-height multiplier. Default 1.2 (matches the text renderer). */
  readonly lineHeightFactor?: number;
  /**
   * Per-paragraph list attributes (aligned by paragraph index). List
   * paragraphs are indented by `(indent + 1) × LIST_INDENT_EM × fontSize`
   * and their wrap budget shrinks accordingly; plain paragraphs with a
   * bare `indent` shift without the marker slot.
   */
  readonly paragraphs?: readonly TextParagraph[];
}

/** Default multiplier from font size to line height (matches `drawText`). */
export const DEFAULT_LINE_HEIGHT_FACTOR = 1.2;

const wrapParagraph = (
  para: string,
  base: number,
  maxWidth: number,
  measure: MeasureText,
  out: LaidOutLine[],
  paraIndex: number,
  indentX: number,
): void => {
  const lineBase = { indentX, para: paraIndex };
  const first = (): boolean => out.length === 0 || req(out[out.length - 1]).para !== paraIndex;
  if (para === "") {
    out.push({ text: "", start: base, end: base, width: 0, ...lineBase, paraFirst: first() });
    return;
  }
  // Word spans (non-whitespace runs) with offsets relative to `para`.
  const words: { s: number; e: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(para)) !== null) words.push({ s: m.index, e: m.index + m[0].length });
  if (words.length === 0) {
    // Whitespace-only paragraph — keep it as one line so offsets survive.
    out.push({
      text: para,
      start: base,
      end: base + para.length,
      width: measure(para),
      ...lineBase,
      paraFirst: first(),
    });
    return;
  }

  // `white-space: pre-wrap` + `overflow-wrap: break-word` (standard):
  // preserve whitespace, wrap at word boundaries, and break a word that
  // is itself wider than the line so narrowing the block always reflows
  // (a single long word can't overflow forever). Lines are gapless
  // slices of the source — inter-word whitespace at a soft break stays
  // on the preceding line — so every character maps to exactly one line
  // (clean caret offsets). First line starts at 0 (keeps leading
  // whitespace); the last extends to the paragraph end (trailing ws).
  let lineStart = 0;
  const push = (start: number, end: number): void => {
    const text = para.slice(start, end);
    out.push({
      text,
      start: base + start,
      end: base + end,
      width: measure(text),
      ...lineBase,
      paraFirst: first(),
    });
  };
  let i = 0;
  while (i < words.length) {
    const w = req(words[i]);
    if (measure(para.slice(lineStart, w.e)) <= maxWidth) {
      i++; // word fits on the current line — keep it, try the next
      continue;
    }
    if (w.s > lineStart) {
      // Content precedes this word on the line → break before it. The
      // whitespace up to its start stays on the current line (pre-wrap).
      push(lineStart, w.s);
      lineStart = w.s;
      continue; // retry this word on the fresh line
    }
    // The word starts the line and alone overflows → break it by chars,
    // keeping at least one char per line so we always make progress.
    let e = w.s + 1;
    while (e < w.e && measure(para.slice(lineStart, e + 1)) <= maxWidth) e++;
    if (e >= w.e) {
      // Whole (remaining) word consumed — leave it on the current line
      // and advance. Guards termination when the measurer is degenerate
      // (e.g. a constant stub that never reports "fits").
      i++;
      continue;
    }
    push(lineStart, e);
    lineStart = e;
    w.s = e; // remainder of the word continues on the next line
  }
  // Last line keeps everything through the end of the paragraph.
  push(lineStart, para.length);
};

/**
 * Lay out `text` into visual lines with exact source offsets. Always
 * returns at least one (possibly empty) line.
 */
export const layoutText = (
  text: string,
  measure: MeasureText,
  options: LayoutTextOptions,
): EditableTextLayout => {
  const lineHeight = options.fontSize * (options.lineHeightFactor ?? DEFAULT_LINE_HEIGHT_FACTOR);
  const lines: LaidOutLine[] = [];
  let paraStart = 0;
  let paraIndex = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === "\n") {
      const para = text.slice(paraStart, i);
      const attrs = options.paragraphs?.[paraIndex];
      const levels = (attrs?.indent ?? 0) + (attrs?.list !== undefined ? 1 : 0);
      const indentX = levels * LIST_INDENT_EM * options.fontSize;
      if (options.maxWidth === undefined) {
        lines.push({
          text: para,
          start: paraStart,
          end: i,
          width: measure(para),
          indentX,
          para: paraIndex,
          paraFirst: true,
        });
      } else {
        // Keep at least one em of budget so a huge indent can't wedge the
        // wrapper into zero-width lines.
        const budget = Math.max(options.fontSize, options.maxWidth - indentX);
        wrapParagraph(para, paraStart, budget, measure, lines, paraIndex, indentX);
      }
      paraStart = i + 1;
      paraIndex++;
    }
  }
  if (lines.length === 0) {
    lines.push({ text: "", start: 0, end: 0, width: 0, indentX: 0, para: 0, paraFirst: true });
  }
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, l.width + l.indentX);
  const blockWidth = options.maxWidth ?? widest;
  return { lines, lineHeight, blockWidth };
};

/** Left edge (local x) where a line's glyphs start, given the align. */
const lineLeftX = (lineWidth: number, blockWidth: number, align: TextAlign): number => {
  if (align === "center") return blockWidth / 2 - lineWidth / 2;
  if (align === "right") return blockWidth - lineWidth;
  return 0;
};

/**
 * Left edge of a laid-out line INCLUDING its list indent: alignment is
 * computed within the space remaining after the indent, then shifted by
 * it. The single source of glyph-left-x for the renderer, caret,
 * click-to-caret and selection rects — keep them in lockstep.
 */
export const lineLeft = (line: LaidOutLine, blockWidth: number, align: TextAlign): number =>
  lineLeftX(line.width, blockWidth - line.indentX, align) + line.indentX;

/** Index of the line a caret offset falls on (handles boundaries). */
const lineIndexForCaret = (layout: EditableTextLayout, caret: number): number => {
  const { lines } = layout;
  for (let i = 0; i < lines.length; i++) {
    const l = req(lines[i]);
    // Caret belongs to this line when it's within [start, end]; the
    // upper bound is inclusive so end-of-line resolves here, while
    // start-of-next-line (end + 1 for a hard `\n`) resolves to the
    // next line on the following iteration.
    if (caret <= l.end) return i;
  }
  return lines.length - 1;
};

export interface CaretGeometry {
  /** Local x of the caret bar. */
  readonly x: number;
  /** Local y of the caret top (baseline-top line origin). */
  readonly y: number;
  /** Caret height (≈ font size). */
  readonly height: number;
  /** Index of the line the caret sits on. */
  readonly line: number;
}

/**
 * Local-space geometry of the caret for a given source `caret` offset.
 * `align` must match the renderer's `textAlign`.
 */
export const caretGeometry = (
  layout: EditableTextLayout,
  caret: number,
  measure: MeasureText,
  fontSize: number,
  align: TextAlign,
): CaretGeometry => {
  const i = lineIndexForCaret(layout, caret);
  const line = req(layout.lines[i]);
  const col = Math.max(0, Math.min(caret, line.end) - line.start);
  const prefixWidth = col === 0 ? 0 : measure(line.text.slice(0, col));
  const left = lineLeft(line, layout.blockWidth, align);
  return { x: left + prefixWidth, y: i * layout.lineHeight, height: fontSize, line: i };
};

/**
 * Map a local-space point to the nearest source caret offset. Used for
 * click-to-place-caret and drag-to-select.
 */
export const pointToCaretIndex = (
  layout: EditableTextLayout,
  point: Vec2,
  measure: MeasureText,
  align: TextAlign,
): number => {
  const { lines, lineHeight } = layout;
  const i = Math.max(0, Math.min(lines.length - 1, Math.floor(point.y / lineHeight)));
  const line = req(lines[i]);
  const left = lineLeft(line, layout.blockWidth, align);
  // Walk columns, picking the boundary whose x is closest to point.x.
  let best = 0;
  let bestDist = Math.abs(left - point.x);
  for (let col = 1; col <= line.text.length; col++) {
    const x = left + measure(line.text.slice(0, col));
    const d = Math.abs(x - point.x);
    if (d < bestDist) {
      bestDist = d;
      best = col;
    }
  }
  return line.start + best;
};

export interface SelectionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Local-space highlight rectangles covering the source range `[from, to)`
 * (order-independent), one per visual line it spans.
 */
export const selectionRects = (
  layout: EditableTextLayout,
  from: number,
  to: number,
  measure: MeasureText,
  align: TextAlign,
): readonly SelectionRect[] => {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  if (lo === hi) return [];
  const rects: SelectionRect[] = [];
  for (let i = 0; i < layout.lines.length; i++) {
    const line = req(layout.lines[i]);
    const a = Math.max(lo, line.start);
    const b = Math.min(hi, line.end);
    if (a > b) continue;
    if (a === b && !(lo <= line.start && hi > line.end)) {
      // Empty intersection on this line, unless the selection spans the
      // hard break past it (then show a thin trailing marker).
      if (!(hi > line.end && lo <= line.end)) continue;
    }
    const left = lineLeft(line, layout.blockWidth, align);
    const xa = left + (a === line.start ? 0 : measure(line.text.slice(0, a - line.start)));
    const xb = left + (b === line.start ? 0 : measure(line.text.slice(0, b - line.start)));
    // A line whose break is inside the selection gets a small trailing
    // sliver so multi-line selections read continuously.
    const trailing = hi > line.end ? layout.lineHeight * 0.25 : 0;
    rects.push({
      x: xa,
      y: i * layout.lineHeight,
      width: Math.max(0, xb - xa) + trailing,
      height: layout.lineHeight,
    });
  }
  return rects;
};
