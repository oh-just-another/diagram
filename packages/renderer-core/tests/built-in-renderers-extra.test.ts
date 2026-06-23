/**
 * Branch-coverage top-ups for built-in-renderers: degenerate stroke-align
 * offsets, lineCap / lineJoin pass-through, offset polygon / block-arrow
 * strokes, and frame-header ellipsis edge cases (tiny / zero header width).
 */
import { describe, expect, it, beforeAll } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  emptyScene,
  DEFAULT_LAYER_ID,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import { installBuiltinRenderers, renderScene, type RenderTarget } from "../src/index";

beforeAll(() => {
  installBuiltinRenderers();
});

const makeRecorder = (): {
  target: RenderTarget;
  calls: { method: string; args: readonly unknown[] }[];
} => {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const handler: ProxyHandler<object> = {
    get: (_t, prop: string) => {
      if (prop === "size") return { width: 1000, height: 1000 };
      if (prop === "then") return undefined;
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        if (prop === "measureText")
          return { width: typeof args[0] === "string" ? args[0].length * 7 : 0 };
        return undefined;
      };
    },
  };
  return { target: new Proxy({}, handler) as unknown as RenderTarget, calls };
};

const base = (): Omit<Element, "type" | "width" | "height"> => ({
  id: elementId("x"),
  layerId: DEFAULT_LAYER_ID,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
});

const addAndRender = (el: Element) => {
  const { target, calls } = makeRecorder();
  let scene = emptyScene();
  ({ scene } = addElement(scene, el));
  renderScene(scene, target);
  return calls;
};

const methods = (calls: { method: string }[]) => calls.map((c) => c.method);

describe("applyStyle — lineCap / lineJoin pass-through", () => {
  it("emits setLineCap and setLineJoin when both are set on a stroked shape", () => {
    const calls = addAndRender({
      ...base(),
      type: "rectangle",
      width: 100,
      height: 60,
      style: { stroke: "#000", strokeWidth: 4, lineCap: "round", lineJoin: "bevel" },
    });
    expect(methods(calls)).toContain("setLineCap");
    expect(methods(calls)).toContain("setLineJoin");
  });
});

describe("drawRectangle — degenerate stroke offset", () => {
  it("skips the stroke pass when the inside offset collapses the rect (sw <= 0)", () => {
    // width 6, strokeWidth 20 → inside offset 10 → sw = 6 - 20 = -14 ≤ 0 → skip.
    const calls = addAndRender({
      ...base(),
      type: "rectangle",
      width: 6,
      height: 6,
      style: { stroke: "#000", strokeWidth: 20, strokeAlign: "inside" },
    });
    // setStroke happens in applyStyle, but no stroke() paint is issued.
    expect(methods(calls)).not.toContain("stroke");
  });

  it("rounded rect with inside stroke shrinks the corner radius (sr > 0 path)", () => {
    const calls = addAndRender({
      ...base(),
      type: "rectangle",
      width: 100,
      height: 60,
      style: {
        stroke: "#000",
        strokeWidth: 4,
        strokeAlign: "inside",
        roundness: { type: "round", value: 12 },
      },
    });
    expect(methods(calls)).toContain("stroke");
    expect(methods(calls)).toContain("quadraticCurveTo"); // rounded path drawn
  });
});

describe("drawEllipse — degenerate stroke radius", () => {
  it("skips the stroke pass when the inside offset collapses the radius (srx <= 0)", () => {
    const calls = addAndRender({
      ...base(),
      type: "ellipse",
      width: 8,
      height: 8,
      style: { stroke: "#000", strokeWidth: 40, strokeAlign: "inside" },
    });
    // ellipse() is only called for fill (none here) — so no ellipse, no stroke.
    expect(methods(calls)).not.toContain("stroke");
  });
});

describe("drawPolygon — offset stroke path", () => {
  it("offsets the stroke outline when strokeAlign shifts it (offset !== 0)", () => {
    const calls = addAndRender({
      ...base(),
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 20, y: 40 },
      ],
      style: { stroke: "#000", strokeWidth: 4, strokeAlign: "inside" },
    } as Element);
    expect(methods(calls)).toContain("stroke");
    expect(methods(calls)).toContain("moveTo");
  });
});

describe("drawBlockArrow — offset stroke path", () => {
  it("offsets the arrow outline when strokeAlign shifts it", () => {
    const calls = addAndRender({
      ...base(),
      type: "block-arrow",
      width: 100,
      height: 60,
      direction: "right",
      style: { stroke: "#000", strokeWidth: 4, strokeAlign: "outside" },
    } as Element);
    expect(methods(calls)).toContain("stroke");
  });
});

describe("drawFrame — ellipsize edge cases", () => {
  it("zero header width (maxWidth <= 0) draws an empty label", () => {
    // width 10 → avail = 10 - 16 = -6 ≤ 0 → ellipsizeToWidth returns "".
    const calls = addAndRender({
      ...base(),
      type: "frame",
      width: 10,
      height: 100,
      style: {},
      name: "Frame title",
    } as never);
    const labels = calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    expect(labels).toContain("");
  });

  it("tiny header width yields just the ellipsis (lo === 0)", () => {
    // width 20 → avail = 4. Even one char + "…" measures 14 > 4 → returns "…".
    const calls = addAndRender({
      ...base(),
      type: "frame",
      width: 20,
      height: 100,
      style: {},
      name: "Frame title",
    } as never);
    const labels = calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    expect(labels).toContain("…");
  });
});
