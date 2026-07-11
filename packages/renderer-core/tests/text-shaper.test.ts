import { afterEach, describe, expect, it } from "vitest";
import { getActiveTextShaper, setActiveTextShaper, type TextShaper } from "../src/text-shaper";

const shaper: TextShaper = {
  measure: (text, font) => ({ width: text.length * font.size * 0.6 }),
};

afterEach(() => {
  setActiveTextShaper(null);
});

describe("active text shaper registry", () => {
  it("defaults to null", () => {
    expect(getActiveTextShaper()).toBeNull();
  });

  it("installs a shaper and returns it (last write wins)", () => {
    setActiveTextShaper(shaper);
    expect(getActiveTextShaper()).toBe(shaper);
    const other: TextShaper = { measure: () => ({ width: 1 }) };
    setActiveTextShaper(other);
    expect(getActiveTextShaper()).toBe(other);
  });

  it("passing null reverts to the measureText path", () => {
    setActiveTextShaper(shaper);
    setActiveTextShaper(null);
    expect(getActiveTextShaper()).toBeNull();
  });
});
