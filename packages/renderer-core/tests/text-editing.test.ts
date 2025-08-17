import { describe, expect, it } from "vitest";
import {
  caretGeometry,
  layoutText,
  pointToCaretIndex,
  selectionRects,
  type MeasureText,
} from "../src/text-editing.js";

// Monospace stub: every character is 10px wide.
const measure: MeasureText = (s) => s.length * 10;

describe("layoutText", () => {
  it("single line, no wrap", () => {
    const l = layoutText("hello", measure, { fontSize: 20 });
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0]).toMatchObject({ text: "hello", start: 0, end: 5, width: 50 });
    expect(l.lineHeight).toBe(24); // 20 * 1.2
    expect(l.blockWidth).toBe(50);
  });

  it("splits on hard newlines with exact offsets", () => {
    const l = layoutText("a\nbb", measure, { fontSize: 10 });
    expect(l.lines).toHaveLength(2);
    expect(l.lines[0]).toMatchObject({ text: "a", start: 0, end: 1, width: 10 });
    // 'bb' starts at index 2 — the '\n' at index 1 holds no caret.
    expect(l.lines[1]).toMatchObject({ text: "bb", start: 2, end: 4, width: 20 });
    expect(l.blockWidth).toBe(20);
  });

  it("empty string yields one empty line", () => {
    const l = layoutText("", measure, { fontSize: 10 });
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0]).toMatchObject({ text: "", start: 0, end: 0, width: 0 });
  });

  it("word-wraps to maxWidth, pre-wrap (keeps trailing space, gapless offsets)", () => {
    const l = layoutText("aa bb cc", measure, { fontSize: 10, maxWidth: 50 });
    expect(l.lines).toHaveLength(2);
    // pre-wrap: the break whitespace stays on the preceding line, so
    // offsets are gapless (line 1 starts exactly where line 0 ends).
    expect(l.lines[0]).toMatchObject({ text: "aa bb ", start: 0, end: 6 });
    expect(l.lines[1]).toMatchObject({ text: "cc", start: 6, end: 8 });
  });

  it("preserves a trailing empty line after a newline", () => {
    const l = layoutText("x\n", measure, { fontSize: 10 });
    expect(l.lines).toHaveLength(2);
    expect(l.lines[1]).toMatchObject({ text: "", start: 2, end: 2 });
  });
});

describe("caretGeometry", () => {
  it("places the caret at the right column / line (left align)", () => {
    const l = layoutText("a\nbb", measure, { fontSize: 10 });
    expect(caretGeometry(l, 0, measure, 10, "left")).toMatchObject({ x: 0, y: 0, line: 0 });
    expect(caretGeometry(l, 1, measure, 10, "left")).toMatchObject({ x: 10, line: 0 });
    expect(caretGeometry(l, 2, measure, 10, "left")).toMatchObject({ x: 0, line: 1 });
    expect(caretGeometry(l, 4, measure, 10, "left")).toMatchObject({ x: 20, line: 1 });
    expect(caretGeometry(l, 2, measure, 10, "left").y).toBe(l.lineHeight);
  });

  it("offsets lines by align (center)", () => {
    const l = layoutText("a\nbb", measure, { fontSize: 10 }); // blockWidth 20
    // line 0 "a" width 10 → left = 20/2 - 10/2 = 5
    expect(caretGeometry(l, 0, measure, 10, "center").x).toBe(5);
  });
});

describe("pointToCaretIndex", () => {
  it("maps a point to the nearest caret boundary", () => {
    const l = layoutText("a\nbb", measure, { fontSize: 10 });
    expect(pointToCaretIndex(l, { x: 10, y: 0 }, measure, "left")).toBe(1);
    expect(pointToCaretIndex(l, { x: 0, y: l.lineHeight }, measure, "left")).toBe(2);
    expect(pointToCaretIndex(l, { x: 100, y: l.lineHeight }, measure, "left")).toBe(4);
  });

  it("clamps below the last line", () => {
    const l = layoutText("hi", measure, { fontSize: 10 });
    expect(pointToCaretIndex(l, { x: 0, y: 9999 }, measure, "left")).toBe(0);
  });
});

describe("selectionRects", () => {
  it("returns one rect for a single-line range", () => {
    const l = layoutText("hello", measure, { fontSize: 10 });
    const rects = selectionRects(l, 1, 3, measure, "left");
    expect(rects).toHaveLength(1);
    expect(rects[0]).toMatchObject({ x: 10, width: 20 });
  });

  it("is order-independent and empty for a collapsed range", () => {
    const l = layoutText("hello", measure, { fontSize: 10 });
    expect(selectionRects(l, 3, 1, measure, "left")).toHaveLength(1);
    expect(selectionRects(l, 2, 2, measure, "left")).toHaveLength(0);
  });

  it("spans multiple lines", () => {
    const l = layoutText("ab\ncd", measure, { fontSize: 10 });
    const rects = selectionRects(l, 1, 4, measure, "left");
    expect(rects.length).toBe(2);
  });
});
