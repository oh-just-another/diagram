/**
 * Paragraph-attribute helpers behind text lists: index math, canonical
 * form, edit remapping (Enter continues a list, deleting a line drops its
 * attrs) and derived markers with per-level numbering.
 */
import { describe, expect, it } from "vitest";
import {
  listMarkers,
  normalizeParagraphs,
  paragraphCount,
  paragraphRangeForOffsets,
  remapParagraphsForTextChange,
} from "../src/text/paragraphs";

describe("paragraphCount / paragraphRangeForOffsets", () => {
  it("counts newline-separated paragraphs (empty text = one)", () => {
    expect(paragraphCount("")).toBe(1);
    expect(paragraphCount("a")).toBe(1);
    expect(paragraphCount("a\nb\nc")).toBe(3);
    expect(paragraphCount("a\n")).toBe(2);
  });

  it("maps offset ranges to paragraph index ranges", () => {
    const text = "ab\ncd\nef";
    expect(paragraphRangeForOffsets(text, 0, 1)).toEqual({ first: 0, last: 0 });
    expect(paragraphRangeForOffsets(text, 4, 4)).toEqual({ first: 1, last: 1 });
    expect(paragraphRangeForOffsets(text, 1, 7)).toEqual({ first: 0, last: 2 });
    // Reversed and clamped inputs behave.
    expect(paragraphRangeForOffsets(text, 7, 1)).toEqual({ first: 0, last: 2 });
    expect(paragraphRangeForOffsets(text, 0, 999)).toEqual({ first: 0, last: 2 });
  });
});

describe("normalizeParagraphs", () => {
  it("drops trailing plain entries and collapses all-plain to undefined", () => {
    expect(normalizeParagraphs([{}, {}])).toBeUndefined();
    expect(normalizeParagraphs([{ list: "bullet" }, {}])).toEqual([{ list: "bullet" }]);
    expect(normalizeParagraphs([{}, { indent: 1 }])).toEqual([{}, { indent: 1 }]);
  });
});

describe("remapParagraphsForTextChange", () => {
  const bullets = [{ list: "bullet" as const }, { list: "bullet" as const }];

  it("keeps attrs untouched for same-paragraph-count edits", () => {
    expect(remapParagraphsForTextChange("a\nb", "ax\nb", bullets)).toBe(bullets);
  });

  it("Enter inside a list item continues the list", () => {
    // "a\nb" → caret after 'a', Enter → "a\n\nb"
    const out = remapParagraphsForTextChange("a\nb", "a\n\nb", bullets);
    expect(out).toEqual([{ list: "bullet" }, { list: "bullet" }, { list: "bullet" }]);
  });

  it("deleting a paragraph drops its attrs", () => {
    const attrs = [{ list: "bullet" as const }, { list: "numbered" as const }, {}];
    const out = remapParagraphsForTextChange("a\nb\nc", "a\nc", attrs);
    // "a" keeps bullet; "c" matches the old suffix and keeps its (plain) attrs.
    expect(out).toEqual([{ list: "bullet" }]);
  });

  it("returns undefined when there were no attrs to begin with", () => {
    expect(remapParagraphsForTextChange("a", "a\nb", undefined)).toBeUndefined();
  });
});

describe("listMarkers", () => {
  it("derives bullets, numbering and per-level restarts", () => {
    const markers = listMarkers(
      [
        { list: "numbered" },
        { list: "numbered" },
        { list: "numbered", indent: 1 },
        { list: "numbered", indent: 1 },
        { list: "numbered" },
        {},
        { list: "numbered" },
        { list: "bullet" },
      ],
      8,
    );
    expect(markers).toEqual(["1.", "2.", "1.", "2.", "3.", null, "1.", "•"]);
  });

  it("short / missing attrs yield plain paragraphs", () => {
    expect(listMarkers(undefined, 2)).toEqual([null, null]);
    expect(listMarkers([{ list: "bullet" }], 2)).toEqual(["•", null]);
  });
});
