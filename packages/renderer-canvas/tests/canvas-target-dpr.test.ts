import { describe, expect, it } from "vitest";
import { Canvas2DTarget } from "../src/index";
import { matrix } from "@oh-just-another/math";

/**
 * An ABSOLUTE `setTransform` must compose the device-pixel-ratio base,
 * not replace it. `renderScene` / `renderOverlay` push the world→screen
 * (CSS-px) matrix via `setTransform`; the bitmap is dpr× larger, so the
 * ctx transform has to be `scale(dpr) · t`.
 */
const makeCtx = () => {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const canvas = { width: 300, height: 300 };
  const handler: ProxyHandler<object> = {
    get: (_t, prop: string | symbol) => {
      if (prop === "canvas") return canvas;
      return (...args: unknown[]) => {
        if (typeof prop === "string") calls.push({ method: prop, args });
      };
    },
    set: () => true,
  };
  return { ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D, calls };
};

const lastSetTransform = (calls: { method: string; args: readonly unknown[] }[]) =>
  [...calls].reverse().find((c) => c.method === "setTransform")?.args;

describe("Canvas2DTarget DPR-aware transforms", () => {
  it("setTransform composes the dpr scale (scale(dpr) · t)", () => {
    const { ctx, calls } = makeCtx();
    const t = new Canvas2DTarget(ctx, 100, 100, 3);
    // world→screen: 2× zoom, pan offset → e/f translation.
    t.setTransform({ a: 2, b: 0, c: 0, d: 2, e: 40, f: 25 });
    // Expect every component × 3.
    expect(lastSetTransform(calls)).toEqual([6, 0, 0, 6, 120, 75]);
  });

  it("resetTransform resets to the dpr base, not raw identity", () => {
    const { ctx, calls } = makeCtx();
    const t = new Canvas2DTarget(ctx, 100, 100, 2.5);
    t.resetTransform();
    expect(lastSetTransform(calls)).toEqual([2.5, 0, 0, 2.5, 0, 0]);
  });

  it("dpr = 1 leaves the transform unchanged (desktop unaffected)", () => {
    const { ctx, calls } = makeCtx();
    const t = new Canvas2DTarget(ctx, 100, 100); // default dpr 1
    t.setTransform({ a: 1.5, b: 0, c: 0, d: 1.5, e: -10, f: 5 });
    expect(lastSetTransform(calls)).toEqual([1.5, 0, 0, 1.5, -10, 5]);
  });

  it("resize updates the dpr used by subsequent setTransform", () => {
    const { ctx, calls } = makeCtx();
    const t = new Canvas2DTarget(ctx, 100, 100, 1);
    t.resize(120, 90, 2); // moved to a 2× display
    t.setTransform({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    expect(lastSetTransform(calls)).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it("a world point lands at the same device pixel as the shape (no overlay offset)", () => {
    // The overlay draws the selection rect via setTransform(w2s) then strokes
    // in world coords; the shape (main) draws the same world rect. Both must
    // resolve to the same DEVICE pixel. Emulate the device matrix the ctx ends
    // up with and check a world corner maps identically.
    const dpr = 3;
    const w2s = { a: 2, b: 0, c: 0, d: 2, e: 50, f: 30 }; // zoom 2, pan
    const { ctx, calls } = makeCtx();
    const t = new Canvas2DTarget(ctx, 100, 100, dpr);
    t.setTransform(w2s);
    const [a, b, c, d, e, f] = lastSetTransform(calls) as number[];
    const deviceMatrix = { a: a!, b: b!, c: c!, d: d!, e: e!, f: f! };
    const worldCorner = { x: 120, y: 80 };
    const onDevice = matrix.applyToPoint(deviceMatrix, worldCorner);
    // Same as applying scale(dpr) after the CSS-space w2s.
    const css = matrix.applyToPoint(w2s, worldCorner);
    expect(onDevice.x).toBeCloseTo(css.x * dpr, 6);
    expect(onDevice.y).toBeCloseTo(css.y * dpr, 6);
  });
});
