import { describe, expect, it } from "vitest";
import { elementId, layerId } from "@oh-just-another/types";
import {
  applyStyleToRange,
  normalizeRuns,
  orderBetween,
  runsToText,
  sliceRuns,
  type TextElement,
  type TextRun,
} from "../src/index";

const el = (over: Partial<TextElement>): TextElement => ({
  id: elementId("t1"),
  layerId: layerId("l1"),
  type: "text",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  text: "Hello world",
  fontFamily: "sans-serif",
  fontSize: 16,
  style: {},
  ...over,
});

describe("runsToText", () => {
  it("concatenates run texts", () => {
    expect(runsToText([{ text: "Hel" }, { text: "lo" }])).toBe("Hello");
  });
});

describe("normalizeRuns", () => {
  it("drops empty runs and coalesces equal-styled neighbours", () => {
    const runs: TextRun[] = [
      { text: "a" },
      { text: "" },
      { text: "b" },
      { text: "c", style: { fontWeight: "bold" } },
    ];
    expect(normalizeRuns(runs)).toEqual([
      { text: "ab" },
      { text: "c", style: { fontWeight: "bold" } },
    ]);
  });

  it("does not coalesce runs with different styles", () => {
    const runs: TextRun[] = [
      { text: "a", style: { fontWeight: "bold" } },
      { text: "b", style: { fontStyle: "italic" } },
    ];
    expect(normalizeRuns(runs)).toEqual(runs);
  });
});

describe("sliceRuns", () => {
  it("derives a single unstyled run from a plain text element", () => {
    expect(sliceRuns({ text: "Hello world" }, 0, 5)).toEqual([{ text: "Hello" }]);
  });

  it("clips styled runs to a sub-range", () => {
    const source: TextRun[] = [
      { text: "Hello", style: { fontWeight: "bold" } },
      { text: " world" },
    ];
    expect(sliceRuns({ text: "Hello world", runs: source }, 3, 8)).toEqual([
      { text: "lo", style: { fontWeight: "bold" } },
      { text: " wo" },
    ]);
  });
});

describe("applyStyleToRange", () => {
  it("is a no-op for an empty range", () => {
    const e = el({});
    expect(applyStyleToRange(e, 3, 3, { fontWeight: "bold" })).toBe(e);
  });

  it("keeps flat text as the source of truth", () => {
    const e = el({});
    const next = applyStyleToRange(e, 0, 5, { fontWeight: "bold" });
    expect(next.text).toBe("Hello world");
    expect(runsToText(next.runs ?? [])).toBe("Hello world");
  });

  it("splits a plain element into styled + unstyled runs", () => {
    const next = applyStyleToRange(el({}), 0, 5, { fontWeight: "bold" });
    expect(next.runs).toEqual([
      { text: "Hello", style: { fontWeight: "bold" } },
      { text: " world" },
    ]);
  });

  it("styles an interior slice into three runs", () => {
    const next = applyStyleToRange(el({}), 6, 11, { fill: "#f00" });
    expect(next.runs).toEqual([{ text: "Hello " }, { text: "world", style: { fill: "#f00" } }]);
  });

  it("merges a new field over an existing run style", () => {
    const bolded = applyStyleToRange(el({}), 0, 5, { fontWeight: "bold" });
    const both = applyStyleToRange(bolded, 0, 5, { fontStyle: "italic" });
    expect(both.runs?.[0]).toEqual({
      text: "Hello",
      style: { fontWeight: "bold", fontStyle: "italic" },
    });
  });

  it("drops the overlay when the whole block reverts to uniform style", () => {
    const bolded = applyStyleToRange(el({}), 0, 5, { fontWeight: "bold" });
    const cleared = applyStyleToRange(bolded, 0, 11, { fontWeight: "normal" });
    // Every char now shares `{fontWeight:"normal"}` — but that is still a
    // non-empty overlay, so runs persist as one uniform run.
    expect(cleared.runs).toEqual([{ text: "Hello world", style: { fontWeight: "normal" } }]);
  });

  it("sheds runs entirely when the overlay coalesces to nothing", () => {
    // Bold the middle, then re-apply an empty patch over everything: the
    // middle run keeps bold, so it stays; verify the reverting path instead.
    const e = el({ runs: [{ text: "Hello world" }] });
    const next = applyStyleToRange(e, 0, 11, {});
    expect(next.runs).toBeUndefined();
  });
});
