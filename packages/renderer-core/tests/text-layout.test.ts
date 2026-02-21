import { describe, expect, it } from "vitest";
import { wrapText, type WrapOptions } from "../src/text-layout.js";
import type { RenderTarget } from "../src/render-target.js";
import type { TextShaper } from "../src/text-shaper.js";

// ---------------------------------------------------------------------------
// Minimal RenderTarget that uses a simple char-width model.
// Each character is `charWidth` pixels wide; spaces included.
// ---------------------------------------------------------------------------
const makeMeasureTarget = (charWidth = 8): RenderTarget => {
  const handler: ProxyHandler<object> = {
    get: (_t, prop: string) => {
      if (prop === "size") return { width: 1000, height: 1000 };
      if (prop === "then") return undefined;
      if (prop === "measureText") {
        return (text: string) => ({ width: text.length * charWidth });
      }
      return () => undefined;
    },
  };
  return new Proxy({}, handler) as unknown as RenderTarget;
};

// Shaper that counts characters × charWidth (for deterministic tests).
const makeMeasureShaper = (charWidth = 8): TextShaper => ({
  measure: (text: string) => ({ width: text.length * charWidth }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const wrap = (
  text: string,
  maxWidth: number,
  charWidth = 8,
  extra: Partial<WrapOptions> = {},
): ReturnType<typeof wrapText> => {
  const target = makeMeasureTarget(charWidth);
  return wrapText(text, target, { maxWidth, fontSize: 14, ...extra });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("wrapText – lineHeight", () => {
  it("uses default lineHeightFactor of 1.2", () => {
    const { lineHeight } = wrap("hello", 999);
    expect(lineHeight).toBeCloseTo(14 * 1.2);
  });

  it("respects a custom lineHeightFactor", () => {
    const { lineHeight } = wrap("hello", 999, 8, { lineHeightFactor: 2 });
    expect(lineHeight).toBeCloseTo(14 * 2);
  });
});

describe("wrapText – empty / whitespace input", () => {
  it("returns one empty line for an empty string", () => {
    const { lines } = wrap("", 200);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ text: "", width: 0 });
  });

  it("returns one empty line for a whitespace-only string", () => {
    const { lines } = wrap("   ", 200);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ text: "", width: 0 });
  });

  it("handles a tab character as whitespace", () => {
    const { lines } = wrap("hello\tworld", 999);
    // tab is collapsed by /\s+/; words join on a single space
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe("hello world");
  });
});

describe("wrapText – single word (short and long)", () => {
  it("returns a single line for a word shorter than maxWidth", () => {
    // "hello" = 5 chars × 8 = 40 px
    const { lines } = wrap("hello", 200);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ text: "hello", width: 40 });
  });

  it("places a word wider than maxWidth on its own line (no hard break)", () => {
    // "superlongword" = 13 chars × 8 = 104 px, maxWidth = 50
    const { lines } = wrap("superlongword", 50);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe("superlongword");
    expect(lines[0]!.width).toBe(104);
  });
});

describe("wrapText – greedy wrapping", () => {
  // charWidth = 10 for easy arithmetic
  // "aaa" = 30 px, "bb" = 20 px, "aaa bb" = 60 px
  it("fits words on the same line when they don't exceed maxWidth", () => {
    const { lines } = wrap("aaa bb", 999, 10);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe("aaa bb");
  });

  it("wraps to next line when candidate would exceed maxWidth", () => {
    // maxWidth = 50: "aaa bb" (60 px) exceeds → wrap
    const { lines } = wrap("aaa bb", 50, 10);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text).toBe("aaa");
    expect(lines[1]!.text).toBe("bb");
  });

  it("exactly fits words at maxWidth boundary", () => {
    // "aa bb" = 5 chars × 10 = 50 px; maxWidth 50 → fits (≤ condition)
    const { lines } = wrap("aa bb", 50, 10);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe("aa bb");
  });

  it("wraps three-word sentence correctly", () => {
    // charWidth=10: "one"=30 "two"=30 "three"=50
    // maxWidth=70: "one two"=70 fits, then "three" on next line
    const { lines } = wrap("one two three", 70, 10);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text).toBe("one two");
    expect(lines[1]!.text).toBe("three");
  });

  it("records correct widths for each wrapped line", () => {
    const { lines } = wrap("aaa bb cc", 50, 10);
    // "aaa"=30, "bb"=20, "cc"=20
    // "aaa bb"=60 > 50 → wrap; "bb cc"=50 ≤ 50 → fits
    expect(lines[0]!.text).toBe("aaa");
    expect(lines[0]!.width).toBe(30);
    expect(lines[1]!.text).toBe("bb cc");
    expect(lines[1]!.width).toBe(50);
  });
});

describe("wrapText – newline handling", () => {
  it("splits on explicit newlines regardless of width", () => {
    const { lines } = wrap("hello\nworld", 999);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text).toBe("hello");
    expect(lines[1]!.text).toBe("world");
  });

  it("produces empty line for double newline (blank paragraph)", () => {
    const { lines } = wrap("hello\n\nworld", 999);
    expect(lines).toHaveLength(3);
    expect(lines[0]!.text).toBe("hello");
    expect(lines[1]!.text).toBe("");
    expect(lines[1]!.width).toBe(0);
    expect(lines[2]!.text).toBe("world");
  });

  it("handles leading newline", () => {
    const { lines } = wrap("\nhello", 999);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text).toBe("");
    expect(lines[1]!.text).toBe("hello");
  });

  it("handles trailing newline", () => {
    const { lines } = wrap("hello\n", 999);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text).toBe("hello");
    expect(lines[1]!.text).toBe("");
  });

  it("wraps each paragraph's words independently", () => {
    // maxWidth=50, charWidth=10: "aaa bb" (60) wraps within first paragraph
    const { lines } = wrap("aaa bb\nccc", 50, 10);
    expect(lines).toHaveLength(3);
    expect(lines[0]!.text).toBe("aaa");
    expect(lines[1]!.text).toBe("bb");
    expect(lines[2]!.text).toBe("ccc");
  });
});

describe("wrapText – multiple paragraphs (many newlines)", () => {
  it("handles many blank lines in a row", () => {
    const { lines } = wrap("\n\n\n", 999);
    expect(lines).toHaveLength(4);
    for (const l of lines) expect(l.text).toBe("");
  });
});

describe("wrapText – using TextShaper instead of target.measureText", () => {
  it("routes measurements through shaper.measure when shaper is provided", () => {
    const shaper = makeMeasureShaper(10);
    const target = makeMeasureTarget(999); // target.measureText would give huge widths
    const { lines } = wrapText("aaa bb", target, {
      maxWidth: 50,
      fontSize: 14,
      shaper,
    });
    // With shaper charWidth=10: "aaa bb"=60 > 50 → wrap
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text).toBe("aaa");
    expect(lines[1]!.text).toBe("bb");
  });

  it("passes fontFamily to shaper.measure", () => {
    const calls: { text: string; family: string }[] = [];
    const shaper: TextShaper = {
      measure: (text, font) => {
        calls.push({ text, family: font.family });
        return { width: text.length * 10 };
      },
    };
    const target = makeMeasureTarget();
    wrapText("hello world", target, {
      maxWidth: 999,
      fontSize: 14,
      fontFamily: "monospace",
      shaper,
    });
    expect(calls.every((c) => c.family === "monospace")).toBe(true);
  });

  it("defaults fontFamily to sans-serif when not specified", () => {
    const calls: string[] = [];
    const shaper: TextShaper = {
      measure: (text, font) => {
        calls.push(font.family);
        return { width: text.length * 5 };
      },
    };
    const target = makeMeasureTarget();
    wrapText("hi", target, { maxWidth: 999, fontSize: 14, shaper });
    expect(calls.every((f) => f === "sans-serif")).toBe(true);
  });
});

describe("wrapText – collapsed whitespace", () => {
  it("collapses multiple spaces within a paragraph into word boundaries", () => {
    const { lines } = wrap("hello   world", 999);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe("hello world");
  });

  it("trims leading/trailing spaces within a paragraph", () => {
    const { lines } = wrap("  hello  ", 999);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe("hello");
  });
});

describe("wrapText – long word overflow behaviour", () => {
  it("a long word followed by short words that fit: long word on its own line", () => {
    // charWidth=10, maxWidth=50
    // "superlongword"=130, "hi"=20
    // "superlongword hi" = 160 > 50 → wrap immediately
    const { lines } = wrap("superlongword hi", 50, 10);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text).toBe("superlongword");
    expect(lines[1]!.text).toBe("hi");
  });
});
