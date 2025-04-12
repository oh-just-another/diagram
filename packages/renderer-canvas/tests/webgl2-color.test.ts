import { describe, expect, it, vi } from "vitest";
import { parseWebGL2Color } from "../src/webgl2-color";

describe("parseWebGL2Color", () => {
  it("parses long hex (#rrggbb)", () => {
    expect(parseWebGL2Color("#ff8000")).toEqual([1, 128 / 255, 0, 1]);
  });

  it("parses short hex (#rgb)", () => {
    const [r, g, b, a] = parseWebGL2Color("#bbb");
    // #bbb expands to #bbbbbb → 187/255 per channel
    expect(r).toBeCloseTo(187 / 255, 5);
    expect(g).toBeCloseTo(187 / 255, 5);
    expect(b).toBeCloseTo(187 / 255, 5);
    expect(a).toBe(1);
  });

  it("parses #rrggbbaa with alpha", () => {
    const [r, g, b, a] = parseWebGL2Color("#ff000080");
    expect(r).toBe(1);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBeCloseTo(128 / 255, 5);
  });

  it("parses rgb() and rgba()", () => {
    expect(parseWebGL2Color("rgb(255, 0, 0)")).toEqual([1, 0, 0, 1]);
    const [r, g, b, a] = parseWebGL2Color("rgba(0, 0, 0, 0.5)");
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
    expect(a).toBe(0.5);
  });

  it("recognises named colors including transparent and white", () => {
    expect(parseWebGL2Color("white")).toEqual([1, 1, 1, 1]);
    expect(parseWebGL2Color("transparent")).toEqual([0, 0, 0, 0]);
  });

  it("explicit null = fully transparent (no draw)", () => {
    expect(parseWebGL2Color(null)).toEqual([0, 0, 0, 0]);
  });

  it("falls back to opaque black with a warning on unparseable input", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseWebGL2Color("not-a-color")).toEqual([0, 0, 0, 1]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
