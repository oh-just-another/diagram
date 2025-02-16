import { describe, expect, it } from "vitest";
import { color } from "@oh-just-another/math";

/**
 * WCAG AA contrast audit for the demo's CSS-var theme tokens
 * (defined in `apps/demo/index.html`). Lives in react-ui because that's
 * the package that prescribes the fallback values (`var(--text, #ddd)`
 * etc.) for its own components; if a fallback drifts, this test catches it.
 *
 * Manual sync: when you edit a theme colour in the demo HTML,
 * update the corresponding constant below. Pure unit-check via
 * `@oh-just-another/math/color` — no browser needed.
 *
 * Thresholds: regular text = 4.5:1, large text (decoration,
 * non-critical) = 3:1.
 */

const DARK = {
  bg: "#1a1a1a",
  panel: "#161616",
  text: "#ddd",
  textStrong: "#fff",
  muted: "#888",
  accent: "#1a73e8",
} as const;

const LIGHT = {
  bg: "#fafafa",
  panel: "#fff",
  text: "#333",
  textStrong: "#000",
  muted: "#666",
  accent: "#1a73e8",
} as const;

const ratio = (fg: string, bg: string): number =>
  color.contrastRatio(color.parse(fg), color.parse(bg));

describe("theme contrast (WCAG AA)", () => {
  it.each([
    ["dark text on dark bg", DARK.text, DARK.bg],
    ["dark text-strong on dark bg", DARK.textStrong, DARK.bg],
    ["dark text on dark panel", DARK.text, DARK.panel],
    ["light text on light bg", LIGHT.text, LIGHT.bg],
    ["light text-strong on light bg", LIGHT.textStrong, LIGHT.bg],
    ["light text on light panel", LIGHT.text, LIGHT.panel],
  ])("%s meets AA (>= 4.5:1)", (_label, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["dark muted on dark bg", DARK.muted, DARK.bg],
    ["light muted on light bg", LIGHT.muted, LIGHT.bg],
  ])("%s meets large-text AA (>= 3:1)", (_label, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it("accent has at least 3:1 against both backgrounds (focus ring visibility)", () => {
    expect(ratio(DARK.accent, DARK.bg)).toBeGreaterThanOrEqual(3);
    expect(ratio(LIGHT.accent, LIGHT.bg)).toBeGreaterThanOrEqual(3);
  });
});
