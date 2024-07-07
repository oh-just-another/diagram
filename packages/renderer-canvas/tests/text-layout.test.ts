import { describe, expect, it } from "vitest";
import { wrapText } from "../src/index";
import type { RenderTarget } from "@oh-just-another/renderer-core";

/** Measure: each character is 10 CSS pixels wide. */
const target = {
  measureText: (s: string) => ({ width: s.length * 10 }),
} as unknown as RenderTarget;

describe("wrapText", () => {
  it("returns one line when text fits", () => {
    const { lines } = wrapText("hi there", target, { maxWidth: 1000, fontSize: 16 });
    expect(lines.map((l) => l.text)).toEqual(["hi there"]);
  });

  it("wraps on the last word that still fits", () => {
    // Measure: each char = 10px including spaces.
    // "the quick brown" = 15 chars → 150. Adding " fox" (4 chars) → 190 > 180.
    // So "the quick brown" stays on the first line, "fox" goes to the second.
    const { lines } = wrapText("the quick brown fox", target, { maxWidth: 180, fontSize: 16 });
    expect(lines.map((l) => l.text)).toEqual(["the quick brown", "fox"]);
  });

  it("respects explicit newlines", () => {
    const { lines } = wrapText("first\nsecond", target, { maxWidth: 1000, fontSize: 16 });
    expect(lines.map((l) => l.text)).toEqual(["first", "second"]);
  });

  it("words longer than maxWidth overflow horizontally on their own line", () => {
    const { lines } = wrapText("supercalifragilistic", target, { maxWidth: 50, fontSize: 16 });
    expect(lines.map((l) => l.text)).toEqual(["supercalifragilistic"]);
  });

  it("collapses whitespace runs", () => {
    const { lines } = wrapText("a   b  c", target, { maxWidth: 1000, fontSize: 16 });
    expect(lines.map((l) => l.text)).toEqual(["a b c"]);
  });

  it("preserves empty lines from \\n\\n", () => {
    const { lines } = wrapText("a\n\nb", target, { maxWidth: 1000, fontSize: 16 });
    expect(lines.map((l) => l.text)).toEqual(["a", "", "b"]);
  });

  it("lineHeight = fontSize * factor (default 1.2)", () => {
    const r = wrapText("x", target, { maxWidth: 100, fontSize: 20 });
    expect(r.lineHeight).toBe(24);
    const r2 = wrapText("x", target, { maxWidth: 100, fontSize: 20, lineHeightFactor: 1.5 });
    expect(r2.lineHeight).toBe(30);
  });
});
