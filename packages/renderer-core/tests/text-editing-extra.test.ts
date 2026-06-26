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

describe("layoutText — wrap branch coverage", () => {
  it("keeps a whitespace-only paragraph as a single line", () => {
    // `words.length === 0` arm: the paragraph has no \S runs.
    const l = layoutText("   ", measure, { fontSize: 10, maxWidth: 100 });
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0]).toMatchObject({ text: "   ", start: 0, end: 3, width: 30 });
  });

  it("breaks a single word that is wider than the line, char by char", () => {
    // One word "aaaaaa" (60px) wider than maxWidth 30 → break into chars,
    // keeping at least one char per line.
    const l = layoutText("aaaaaa", measure, { fontSize: 10, maxWidth: 30 });
    expect(l.lines.length).toBeGreaterThan(1);
    // Every line carries at least one char.
    for (const line of l.lines) expect(line.text.length).toBeGreaterThanOrEqual(1);
    // Offsets remain gapless and cover the whole word.
    expect(l.lines[0]!.start).toBe(0);
    expect(l.lines[l.lines.length - 1]!.end).toBe(6);
  });

  it("breaks before a word when content already precedes it on the line", () => {
    // "aaa bbb" with maxWidth 40: "aaa " is 40, "bbb" pushes over → break
    // before "bbb" (w.s > lineStart arm).
    const l = layoutText("aaa bbb", measure, { fontSize: 10, maxWidth: 40 });
    expect(l.lines).toHaveLength(2);
    expect(l.lines[0]!.text).toBe("aaa ");
    expect(l.lines[1]!.text).toBe("bbb");
  });

  it("terminates with a degenerate measurer that never reports 'fits'", () => {
    // A constant stub that always exceeds maxWidth exercises the
    // `e >= w.e` progress guard inside the char-break loop.
    const huge: MeasureText = () => 9999;
    const l = layoutText("abc", huge, { fontSize: 10, maxWidth: 1 });
    // Must not loop forever; every char ends up placed.
    expect(l.lines[l.lines.length - 1]!.end).toBe(3);
  });

  it("no-wrap path keeps blockWidth at the widest measured line", () => {
    const l = layoutText("a\nbbbb", measure, { fontSize: 10 });
    // maxWidth undefined → blockWidth = widest = 40.
    expect(l.blockWidth).toBe(40);
  });
});

describe("caretGeometry — align + boundary branches", () => {
  it("right-align places line glyphs flush to the block's right edge", () => {
    const l = layoutText("a\nbb", measure, { fontSize: 10 }); // blockWidth 20
    // line 0 "a" width 10 → left = 20 - 10 = 10; caret at col 0 sits there.
    expect(caretGeometry(l, 0, measure, 10, "right").x).toBe(10);
  });

  it("clamps a caret beyond the end of the text to the last line", () => {
    // lineIndexForCaret fallback `return lines.length - 1`.
    const l = layoutText("ab", measure, { fontSize: 10 });
    const g = caretGeometry(l, 999, measure, 10, "left");
    expect(g.line).toBe(0);
    // col clamps to line.end (2) → x = 20.
    expect(g.x).toBe(20);
  });

  it("col === 0 yields zero prefix width (no measure call needed)", () => {
    const l = layoutText("hello", measure, { fontSize: 10 });
    expect(caretGeometry(l, 0, measure, 10, "left").x).toBe(0);
  });
});

describe("pointToCaretIndex — clamp branches", () => {
  it("clamps a negative y to the first line", () => {
    const l = layoutText("a\nbb", measure, { fontSize: 10 });
    // Math.floor(point.y / lineHeight) < 0 → clamped to line 0.
    expect(pointToCaretIndex(l, { x: 0, y: -50 }, measure, "left")).toBe(0);
  });

  it("respects right-align when mapping a point to a column", () => {
    const l = layoutText("ab", measure, { fontSize: 10 }); // blockWidth 20, left=0
    // Single line; clicking far right snaps to the end.
    expect(pointToCaretIndex(l, { x: 100, y: 0 }, measure, "right")).toBe(2);
  });
});

describe("selectionRects — multi-line + trailing-sliver branches", () => {
  it("adds a trailing sliver on a line whose hard break is inside the selection", () => {
    const l = layoutText("ab\ncd", measure, { fontSize: 10 });
    // Selection spans from mid line 0 across the break into line 1.
    const rects = selectionRects(l, 1, 4, measure, "left");
    expect(rects).toHaveLength(2);
    // Line 0 break is inside the selection → trailing sliver added
    // (lineHeight * 0.25 = 3) on top of the glyph width.
    const line0 = rects[0]!;
    // line 0: a=1, b=2 → glyph width 10, + 3 sliver = 13.
    expect(line0.width).toBeCloseTo(13);
  });

  it("emits a thin marker on an empty line fully inside a multi-line selection", () => {
    // "a\n\nb": middle line is empty; a selection spanning it must still
    // produce a rect for the empty line (the spans-the-break arm).
    const l = layoutText("a\n\nb", measure, { fontSize: 10 });
    expect(l.lines).toHaveLength(3);
    const rects = selectionRects(l, 0, 4, measure, "left");
    // One rect per spanned line.
    expect(rects.length).toBe(3);
    // Empty middle line gets only the trailing sliver as width.
    const mid = rects[1]!;
    expect(mid.width).toBeCloseTo(l.lineHeight * 0.25);
  });

  it("skips a line with an empty, non-spanning intersection", () => {
    // Collapsed-at-line-boundary selection that does not cross the break
    // should not emit a rect for the untouched line.
    const l = layoutText("ab\ncd", measure, { fontSize: 10 });
    // Select within line 1 only (cd: offsets 3..5).
    const rects = selectionRects(l, 3, 5, measure, "left");
    expect(rects).toHaveLength(1);
    expect(rects[0]!.y).toBe(l.lineHeight);
  });

  it("returns no rects for a collapsed (lo === hi) range", () => {
    const l = layoutText("abc", measure, { fontSize: 10 });
    expect(selectionRects(l, 2, 2, measure, "left")).toHaveLength(0);
  });
});
