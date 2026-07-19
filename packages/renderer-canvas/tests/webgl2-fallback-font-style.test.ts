import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebGL2Target } from "../src/webgl2/webgl2-target";

/**
 * When no MSDF shaper is registered (WASM blocked / still loading / an
 * engine without it), WebGL2 falls back to rasterising text on an
 * OffscreenCanvas 2D context. That fallback must honour the active font
 * weight/style — otherwise `setFont(..., { weight: "bold" })` draws the
 * regular face and only colour appears to change (bug FT10).
 *
 * The real GPU is unavailable in jsdom, so the target is driven with a
 * Proxy GL stub (constructor finishes, draws no-op) and OffscreenCanvas
 * is mocked to record every `font` string assigned to a 2D context.
 */
const makeStubGl = () => {
  const base: Record<string, unknown> = {};
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return () => 1;
    },
  });
};

const makeTarget = (): WebGL2Target => {
  const gl = makeStubGl();
  const canvas = {
    width: 100,
    height: 100,
    getContext: () => gl,
  } as unknown as HTMLCanvasElement;
  return new WebGL2Target(canvas, 100, 100);
};

let fontStrings: string[];

beforeEach(() => {
  fontStrings = [];
  const ctxStub = {
    set font(v: string) {
      fontStrings.push(v);
    },
    get font() {
      return fontStrings[fontStrings.length - 1] ?? "";
    },
    textAlign: "left",
    textBaseline: "top",
    fillStyle: "#000",
    measureText: () => ({ width: 10, fontBoundingBoxDescent: 2 }),
    fillText: () => {},
  };
  class MockOffscreenCanvas {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      return ctxStub;
    }
  }
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = MockOffscreenCanvas;
});

afterEach(() => {
  delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
});

describe("WebGL2 OffscreenCanvas text fallback honours weight/style", () => {
  it("builds a bold font string for setFont({ weight: 'bold' })", () => {
    const t = makeTarget();
    t.setFont("sans-serif", 20, { weight: "bold" });
    t.setFill("#000");
    t.fillText("Hi", 0, 0);
    expect(fontStrings.some((s) => /\bbold\b/.test(s))).toBe(true);
  });

  it("builds an italic font string for setFont({ style: 'italic' })", () => {
    const t = makeTarget();
    t.setFont("sans-serif", 20, { style: "italic" });
    t.setFill("#000");
    t.fillText("Hi", 0, 0);
    expect(fontStrings.some((s) => /\bitalic\b/.test(s))).toBe(true);
  });

  it("keeps a plain (non-bold) font string for normal weight", () => {
    const t = makeTarget();
    t.setFont("sans-serif", 20);
    t.setFill("#000");
    t.fillText("Hi", 0, 0);
    expect(fontStrings.every((s) => !/\bbold\b/.test(s) && !/\bitalic\b/.test(s))).toBe(true);
  });
});
