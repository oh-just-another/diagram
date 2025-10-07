/**
 * Smoke tests for the curated token surface — they don't assert
 * specific hex values (those track upstream Radix), but they do
 * pin the shape of the exports so a consumer pkg
 * (`react-ui` / `templates` / `state` / `renderer-core`) can rely
 * on the named structure staying stable.
 */
import { describe, expect, it } from "vitest";
import {
  CANVAS_TONES,
  DEFAULT_EDGE_STYLE,
  DEFAULT_ELEMENT_STYLES,
  DIFF_COLORS,
  GRID_COLOR,
  HUES,
  HUE_TONES,
  UI_ACCENT,
  UI_SURFACE,
} from "../src/index.js";

const HEX_RE = /^#[0-9a-f]{6}$/i;

describe("token shape", () => {
  it("exposes the canonical 7 hues", () => {
    expect(HUES).toEqual(["tomato", "amber", "grass", "cyan", "iris", "plum", "gray"]);
  });

  it("HUE_TONES has fill+solid+textLow+textHigh for every hue in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const hue of HUES) {
        const t = HUE_TONES[theme][hue];
        expect(t.fill).toMatch(HEX_RE);
        expect(t.solid).toMatch(HEX_RE);
        expect(t.solidHover).toMatch(HEX_RE);
        expect(t.textLow).toMatch(HEX_RE);
        expect(t.textHigh).toMatch(HEX_RE);
      }
    }
  });

  it("CANVAS_TONES gives one step-2 hex per hue per theme", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const hue of HUES) {
        expect(CANVAS_TONES[theme][hue]).toMatch(HEX_RE);
      }
    }
  });

  it("UI_SURFACE + UI_ACCENT have both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(typeof UI_SURFACE[theme].canvas).toBe("string");
      expect(typeof UI_SURFACE[theme].bg).toBe("string");
      expect(typeof UI_ACCENT[theme].accent).toBe("string");
      expect(typeof UI_ACCENT[theme].selectedBg).toBe("string");
    }
  });

  it("renderer-side defaults are stable hexes", () => {
    expect(GRID_COLOR).toMatch(HEX_RE);
    expect(DEFAULT_EDGE_STYLE.stroke).toMatch(HEX_RE);
    expect(DEFAULT_EDGE_STYLE.strokeWidth).toBeGreaterThan(0);
    for (const key of ["rectangle", "ellipse", "flowchart", "sticky"] as const) {
      const s = DEFAULT_ELEMENT_STYLES[key];
      expect(s.fill).toMatch(HEX_RE);
      expect(s.stroke).toMatch(HEX_RE);
      expect(s.strokeWidth).toBeGreaterThan(0);
    }
  });

  it("DIFF_COLORS covers added / removed / modified", () => {
    expect(DIFF_COLORS.added).toMatch(HEX_RE);
    expect(DIFF_COLORS.removed).toMatch(HEX_RE);
    expect(DIFF_COLORS.modified).toMatch(HEX_RE);
  });

  it("light fill differs from light solid for the same hue (sanity)", () => {
    for (const hue of HUES) {
      expect(HUE_TONES.light[hue].fill).not.toBe(HUE_TONES.light[hue].solid);
    }
  });
});
