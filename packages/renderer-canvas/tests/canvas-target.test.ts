import { describe, expect, it } from "vitest";
import { Canvas2DTarget } from "../src/index";

/**
 * Mock `CanvasRenderingContext2D` that records each method call. Method
 * receivers like `fillStyle` (settable property) are tracked through a Proxy
 * that intercepts `set`.
 */
const makeCtx = () => {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const props: Record<string, unknown> = {};
  const canvas = { width: 100, height: 100 };
  const handler: ProxyHandler<object> = {
    get: (_t, prop: string | symbol) => {
      if (prop === "canvas") return canvas;
      if (typeof prop === "string" && Object.prototype.hasOwnProperty.call(props, prop)) {
        return props[prop];
      }
      if (prop === "measureText") {
        return (text: string) => {
          calls.push({ method: "measureText", args: [text] });
          return { width: text.length * 6 };
        };
      }
      return (...args: unknown[]) => {
        if (typeof prop === "string") calls.push({ method: prop, args });
      };
    },
    set: (_t, prop: string | symbol, value: unknown) => {
      if (typeof prop === "string") {
        props[prop] = value;
        calls.push({ method: `set:${prop}`, args: [value] });
      }
      return true;
    },
  };
  const ctx = new Proxy({}, handler) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, props };
};

describe("Canvas2DTarget", () => {
  it("size reports the constructor dimensions", () => {
    const { ctx } = makeCtx();
    const t = new Canvas2DTarget(ctx, 800, 600);
    expect(t.size).toEqual({ width: 800, height: 600 });
  });

  it("resize updates size", () => {
    const { ctx } = makeCtx();
    const t = new Canvas2DTarget(ctx, 100, 100);
    t.resize(200, 300);
    expect(t.size).toEqual({ width: 200, height: 300 });
  });

  it("style setters write to context properties", () => {
    const { ctx, props } = makeCtx();
    const t = new Canvas2DTarget(ctx, 100, 100);
    t.setFill("#f00");
    t.setStroke("#0f0");
    t.setStrokeWidth(3);
    t.setOpacity(0.5);
    expect(props.fillStyle).toBe("#f00");
    expect(props.strokeStyle).toBe("#0f0");
    expect(props.lineWidth).toBe(3);
    expect(props.globalAlpha).toBe(0.5);
  });

  it("null fill/stroke falls back to transparent", () => {
    const { ctx, props } = makeCtx();
    const t = new Canvas2DTarget(ctx, 100, 100);
    t.setFill(null);
    expect(props.fillStyle).toBe("transparent");
  });

  it("setFont serializes 'Npx Family'", () => {
    const { ctx, props } = makeCtx();
    const t = new Canvas2DTarget(ctx, 100, 100);
    t.setFont("Arial", 16);
    expect(props.font).toBe("16px Arial");
  });

  it("setTransform passes a/b/c/d/e/f to ctx", () => {
    const { ctx, calls } = makeCtx();
    const t = new Canvas2DTarget(ctx, 100, 100);
    t.setTransform({ a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 });
    const call = calls.find((c) => c.method === "setTransform");
    expect(call?.args).toEqual([1, 0, 0, 1, 10, 20]);
  });

  it("path primitives forward to ctx", () => {
    const { ctx, calls } = makeCtx();
    const t = new Canvas2DTarget(ctx, 100, 100);
    t.beginPath();
    t.moveTo(0, 0);
    t.lineTo(10, 0);
    t.quadraticCurveTo(15, 5, 10, 10);
    t.bezierCurveTo(5, 12, 0, 10, 0, 0);
    t.rect(0, 0, 10, 10);
    t.ellipse(50, 50, 30, 20);
    t.closePath();
    t.fill();
    t.stroke();
    const seen = calls.map((c) => c.method);
    for (const name of [
      "beginPath",
      "moveTo",
      "lineTo",
      "quadraticCurveTo",
      "bezierCurveTo",
      "rect",
      "ellipse",
      "closePath",
      "fill",
      "stroke",
    ]) {
      expect(seen).toContain(name);
    }
  });

  it("clear with bounds calls clearRect with the bounds", () => {
    const { ctx, calls } = makeCtx();
    const t = new Canvas2DTarget(ctx, 100, 100);
    t.clear({ x: 5, y: 6, width: 7, height: 8 });
    const call = calls.find((c) => c.method === "clearRect");
    expect(call?.args).toEqual([5, 6, 7, 8]);
  });

  it("clear without bounds saves/restores and clears entire bitmap", () => {
    const { ctx, calls } = makeCtx();
    const t = new Canvas2DTarget(ctx, 100, 100);
    t.clear();
    expect(calls.find((c) => c.method === "save")).toBeDefined();
    expect(calls.find((c) => c.method === "restore")).toBeDefined();
    const clearRect = calls.find((c) => c.method === "clearRect");
    expect(clearRect?.args).toEqual([0, 0, 100, 100]);
  });

  it("measureText returns just width", () => {
    const { ctx } = makeCtx();
    const t = new Canvas2DTarget(ctx, 100, 100);
    expect(t.measureText("hello").width).toBe(30);
  });
});
