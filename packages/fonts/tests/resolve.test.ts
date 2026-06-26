import { describe, expect, it } from "vitest";
import { FONT_MONO, FONT_SANS, FONT_SERIF, resolveBundledFamily } from "../src/index";

describe("resolveBundledFamily", () => {
  it("maps mono keywords to the mono family (wins over everything)", () => {
    expect(resolveBundledFamily("monospace")).toBe(FONT_MONO);
    expect(resolveBundledFamily("Roboto Mono, monospace")).toBe(FONT_MONO);
  });

  it("maps sans before serif so sans-serif stays sans", () => {
    expect(resolveBundledFamily("sans-serif")).toBe(FONT_SANS);
    expect(resolveBundledFamily("Arial, sans-serif")).toBe(FONT_SANS);
  });

  it("maps serif-ish keywords to the serif family", () => {
    expect(resolveBundledFamily("serif")).toBe(FONT_SERIF);
    expect(resolveBundledFamily("Georgia")).toBe(FONT_SERIF);
    expect(resolveBundledFamily("Times New Roman")).toBe(FONT_SERIF);
  });

  it("defaults an unknown family to sans", () => {
    expect(resolveBundledFamily("Arial")).toBe(FONT_SANS);
    expect(resolveBundledFamily("Helvetica")).toBe(FONT_SANS);
  });
});
