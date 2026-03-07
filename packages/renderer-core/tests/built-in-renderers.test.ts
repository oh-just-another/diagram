/**
 * Verifies every per-shape draw function (rectangle, ellipse, polygon, path,
 * text, image, frame, block-arrow, brush) produces the correct sequence of
 * RenderTarget calls.
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

// ---------------------------------------------------------------------------
// Recorder proxy
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Shared element base
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// drawRectangle
// ---------------------------------------------------------------------------
describe("drawRectangle", () => {
  it("emits rect() for a sharp-cornered fill-only rectangle", () => {
    const calls = addAndRender({
      ...base(),
      type: "rectangle",
      width: 100,
      height: 60,
      style: { fill: "#f00" },
    });
    expect(calls.some((c) => c.method === "setFill" && c.args[0] === "#f00")).toBe(true);
    expect(calls.some((c) => c.method === "rect")).toBe(true);
    expect(calls.some((c) => c.method === "fill")).toBe(true);
    expect(calls.some((c) => c.method === "stroke")).toBe(false);
  });

  it("emits quadraticCurveTo for a rounded rectangle (roundness > 0)", () => {
    const calls = addAndRender({
      ...base(),
      type: "rectangle",
      width: 100,
      height: 60,
      style: { fill: "#f00", roundness: { type: "round", value: 8 } },
    } as Element);
    expect(calls.some((c) => c.method === "quadraticCurveTo")).toBe(true);
    expect(calls.some((c) => c.method === "fill")).toBe(true);
  });

  it("emits stroke() when stroke is configured", () => {
    const calls = addAndRender({
      ...base(),
      type: "rectangle",
      width: 100,
      height: 60,
      style: { stroke: "#00f", strokeWidth: 2 },
    });
    expect(calls.some((c) => c.method === "setStroke" && c.args[0] === "#00f")).toBe(true);
    expect(calls.some((c) => c.method === "setStrokeWidth" && c.args[0] === 2)).toBe(true);
    expect(calls.some((c) => c.method === "stroke")).toBe(true);
  });

  it("emits both fill and stroke when both are set", () => {
    const calls = addAndRender({
      ...base(),
      type: "rectangle",
      width: 80,
      height: 50,
      style: { fill: "#f00", stroke: "#00f", strokeWidth: 1 },
    });
    expect(calls.some((c) => c.method === "fill")).toBe(true);
    expect(calls.some((c) => c.method === "stroke")).toBe(true);
    // fill comes before stroke
    const fillIdx = calls.findIndex((c) => c.method === "fill");
    const strokeIdx = calls.findIndex((c) => c.method === "stroke");
    expect(fillIdx).toBeLessThan(strokeIdx);
  });

  it("skips drawing when no fill and no stroke", () => {
    const calls = addAndRender({
      ...base(),
      type: "rectangle",
      width: 80,
      height: 50,
      style: {},
    });
    expect(calls.some((c) => c.method === "fill")).toBe(false);
    expect(calls.some((c) => c.method === "stroke")).toBe(false);
  });

  it("emits setDashArray when dashArray is set", () => {
    const calls = addAndRender({
      ...base(),
      type: "rectangle",
      width: 80,
      height: 50,
      style: { stroke: "#000", dashArray: [4, 4] },
    });
    expect(calls.some((c) => c.method === "setDashArray")).toBe(true);
  });

  it("emits setOpacity when opacity is set", () => {
    const calls = addAndRender({
      ...base(),
      type: "rectangle",
      width: 80,
      height: 50,
      style: { fill: "#f00", opacity: 0.5 },
    });
    expect(calls.some((c) => c.method === "setOpacity" && c.args[0] === 0.5)).toBe(true);
  });

  it("strokeAlign inside shifts stroke geometry inward", () => {
    const calls = addAndRender({
      ...base(),
      type: "rectangle",
      width: 100,
      height: 60,
      style: { stroke: "#000", strokeWidth: 4, strokeAlign: "inside" },
    });
    // With inside align the stroke rect's x arg > 0 (offset by half strokeWidth = 2)
    const rectCalls = calls.filter((c) => c.method === "rect");
    // There should be a rect call for the stroke geometry with x=2, y=2
    expect(rectCalls.some((c) => (c.args[0] as number) > 0)).toBe(true);
  });

  it("strokeAlign outside shifts stroke geometry outward (negative offset)", () => {
    const calls = addAndRender({
      ...base(),
      type: "rectangle",
      width: 100,
      height: 60,
      style: { stroke: "#000", strokeWidth: 4, strokeAlign: "outside" },
    });
    const rectCalls = calls.filter((c) => c.method === "rect");
    // With outside the x arg is negative
    expect(rectCalls.some((c) => (c.args[0] as number) < 0)).toBe(true);
  });

  it("transparent fill is treated as no fill", () => {
    const calls = addAndRender({
      ...base(),
      type: "rectangle",
      width: 80,
      height: 50,
      style: { fill: "transparent" },
    });
    expect(calls.some((c) => c.method === "fill")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// drawEllipse
// ---------------------------------------------------------------------------
describe("drawEllipse", () => {
  it("emits ellipse() for fill-only ellipse", () => {
    const calls = addAndRender({
      ...base(),
      type: "ellipse",
      width: 60,
      height: 40,
      style: { fill: "#0f0" },
    });
    expect(calls.some((c) => c.method === "ellipse")).toBe(true);
    expect(calls.some((c) => c.method === "fill")).toBe(true);
    expect(calls.some((c) => c.method === "stroke")).toBe(false);
  });

  it("emits two ellipse() calls when both fill and stroke are set", () => {
    const calls = addAndRender({
      ...base(),
      type: "ellipse",
      width: 60,
      height: 40,
      style: { fill: "#0f0", stroke: "#000", strokeWidth: 2 },
    });
    expect(calls.filter((c) => c.method === "ellipse").length).toBe(2);
    expect(calls.some((c) => c.method === "fill")).toBe(true);
    expect(calls.some((c) => c.method === "stroke")).toBe(true);
  });

  it("uses rx/ry = width/2 and height/2 for the fill ellipse", () => {
    const calls = addAndRender({
      ...base(),
      type: "ellipse",
      width: 80,
      height: 40,
      style: { fill: "#f00" },
    });
    const ellipseCalls = calls.filter((c) => c.method === "ellipse");
    // ellipse(cx, cy, rx, ry) → args[2] = 40, args[3] = 20
    expect(ellipseCalls[0]?.args[2]).toBe(40);
    expect(ellipseCalls[0]?.args[3]).toBe(20);
  });

  it("skips drawing when no fill/stroke", () => {
    const calls = addAndRender({
      ...base(),
      type: "ellipse",
      width: 60,
      height: 40,
      style: {},
    });
    expect(calls.some((c) => c.method === "ellipse")).toBe(false);
  });

  it("skips stroke when strokeWidth is 0", () => {
    const calls = addAndRender({
      ...base(),
      type: "ellipse",
      width: 60,
      height: 40,
      style: { stroke: "#000", strokeWidth: 0 },
    });
    expect(calls.some((c) => c.method === "stroke")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// drawPolygon
// ---------------------------------------------------------------------------
describe("drawPolygon", () => {
  const trianglePoints = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 50, y: 80 },
  ];

  it("emits moveTo + lineTo(s) + closePath for a filled triangle", () => {
    const calls = addAndRender({
      ...base(),
      type: "polygon",
      points: trianglePoints,
      style: { fill: "#ff0" },
    });
    expect(calls.some((c) => c.method === "moveTo")).toBe(true);
    expect(calls.some((c) => c.method === "lineTo")).toBe(true);
    expect(calls.some((c) => c.method === "closePath")).toBe(true);
    expect(calls.some((c) => c.method === "fill")).toBe(true);
  });

  it("emits stroke() when stroke is configured", () => {
    const calls = addAndRender({
      ...base(),
      type: "polygon",
      points: trianglePoints,
      style: { stroke: "#f00" },
    });
    expect(calls.some((c) => c.method === "stroke")).toBe(true);
  });

  it("skips rendering for degenerate polygon with < 2 points", () => {
    const calls = addAndRender({
      ...base(),
      type: "polygon",
      points: [{ x: 0, y: 0 }],
      style: { fill: "#f00" },
    });
    expect(calls.some((c) => c.method === "fill")).toBe(false);
  });

  it("skips rendering for empty points array", () => {
    const calls = addAndRender({
      ...base(),
      type: "polygon",
      points: [],
      style: { fill: "#f00" },
    });
    expect(calls.some((c) => c.method === "fill")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// drawPath
// ---------------------------------------------------------------------------
describe("drawPath", () => {
  it("emits moveTo for M command", () => {
    const calls = addAndRender({
      ...base(),
      type: "path",
      commands: [
        { kind: "M", to: { x: 10, y: 20 } },
        { kind: "L", to: { x: 50, y: 60 } },
      ],
      style: { fill: "#f0f" },
    });
    expect(calls.some((c) => c.method === "moveTo" && c.args[0] === 10 && c.args[1] === 20)).toBe(true);
    expect(calls.some((c) => c.method === "lineTo" && c.args[0] === 50 && c.args[1] === 60)).toBe(true);
    expect(calls.some((c) => c.method === "fill")).toBe(true);
  });

  it("emits quadraticCurveTo for Q command", () => {
    const calls = addAndRender({
      ...base(),
      type: "path",
      commands: [
        { kind: "M", to: { x: 0, y: 0 } },
        { kind: "Q", control: { x: 25, y: 50 }, to: { x: 50, y: 0 } },
      ],
      style: { stroke: "#000" },
    });
    expect(calls.some((c) => c.method === "quadraticCurveTo")).toBe(true);
    expect(calls.some((c) => c.method === "stroke")).toBe(true);
  });

  it("emits bezierCurveTo for C command", () => {
    const calls = addAndRender({
      ...base(),
      type: "path",
      commands: [
        { kind: "M", to: { x: 0, y: 0 } },
        { kind: "C", control1: { x: 10, y: 30 }, control2: { x: 40, y: 30 }, to: { x: 50, y: 0 } },
      ],
      style: { stroke: "#000" },
    });
    expect(calls.some((c) => c.method === "bezierCurveTo")).toBe(true);
  });

  it("emits closePath for Z command", () => {
    const calls = addAndRender({
      ...base(),
      type: "path",
      commands: [
        { kind: "M", to: { x: 0, y: 0 } },
        { kind: "L", to: { x: 50, y: 0 } },
        { kind: "Z" },
      ],
      style: { fill: "#f00" },
    });
    expect(calls.some((c) => c.method === "closePath")).toBe(true);
  });

  it("skips rendering for empty commands array", () => {
    const calls = addAndRender({
      ...base(),
      type: "path",
      commands: [],
      style: { fill: "#f00" },
    });
    expect(calls.some((c) => c.method === "fill")).toBe(false);
  });

  it("emits fill then stroke when both are set", () => {
    const calls = addAndRender({
      ...base(),
      type: "path",
      commands: [
        { kind: "M", to: { x: 0, y: 0 } },
        { kind: "L", to: { x: 50, y: 0 } },
      ],
      style: { fill: "#f00", stroke: "#00f" },
    });
    const fillIdx = calls.findIndex((c) => c.method === "fill");
    const strokeIdx = calls.findIndex((c) => c.method === "stroke");
    expect(fillIdx).toBeGreaterThan(-1);
    expect(strokeIdx).toBeGreaterThan(fillIdx);
  });
});

// ---------------------------------------------------------------------------
// drawText
// ---------------------------------------------------------------------------
describe("drawText", () => {
  it("calls setFont with the shape's fontFamily and fontSize", () => {
    const calls = addAndRender({
      ...base(),
      type: "text",
      text: "Hello",
      fontFamily: "sans-serif",
      fontSize: 16,
      style: {},
    });
    expect(calls.some((c) => c.method === "setFont" && c.args[0] === "sans-serif" && c.args[1] === 16)).toBe(true);
  });

  it("calls fillText with the text content", () => {
    const calls = addAndRender({
      ...base(),
      type: "text",
      text: "World",
      fontFamily: "sans-serif",
      fontSize: 12,
      style: {},
    });
    expect(calls.some((c) => c.method === "fillText" && c.args[0] === "World")).toBe(true);
  });

  it("uses fill color from style.fill", () => {
    const calls = addAndRender({
      ...base(),
      type: "text",
      text: "Hi",
      fontFamily: "monospace",
      fontSize: 14,
      style: { fill: "#abc" },
    });
    expect(calls.some((c) => c.method === "setFill" && c.args[0] === "#abc")).toBe(true);
  });

  it("defaults fill to #000 when style.fill is undefined", () => {
    const calls = addAndRender({
      ...base(),
      type: "text",
      text: "Hi",
      fontFamily: "monospace",
      fontSize: 14,
      style: {},
    });
    expect(calls.some((c) => c.method === "setFill" && c.args[0] === "#000")).toBe(true);
  });

  it("sets fontWeight when provided", () => {
    const calls = addAndRender({
      ...base(),
      type: "text",
      text: "Bold",
      fontFamily: "Arial",
      fontSize: 16,
      style: { fontWeight: "bold" },
    });
    const fontCall = calls.find((c) => c.method === "setFont");
    // Third arg is options object with weight
    expect((fontCall?.args[2] as { weight?: string })?.weight).toBe("bold");
  });

  it("always sets textAlign to left (positions are computed per-line)", () => {
    const calls = addAndRender({
      ...base(),
      type: "text",
      text: "center me",
      fontFamily: "Arial",
      fontSize: 14,
      style: { textAlign: "center" },
    });
    // The renderer always emits setTextAlign("left") because it computes x offsets manually
    expect(calls.some((c) => c.method === "setTextAlign" && c.args[0] === "left")).toBe(true);
  });

  it("emits rect() for underline decoration", () => {
    const calls = addAndRender({
      ...base(),
      type: "text",
      text: "underlined",
      fontFamily: "Arial",
      fontSize: 14,
      style: { textDecoration: { underline: true } },
    });
    // underline emits beginPath + rect + fill
    expect(calls.some((c) => c.method === "rect")).toBe(true);
  });

  it("emits rect() for strikethrough decoration", () => {
    const calls = addAndRender({
      ...base(),
      type: "text",
      text: "strikethrough",
      fontFamily: "Arial",
      fontSize: 14,
      style: { textDecoration: { strikethrough: true } },
    });
    expect(calls.some((c) => c.method === "rect")).toBe(true);
  });

  it("handles multiline text via maxWidth wrapping", () => {
    const calls = addAndRender({
      ...base(),
      type: "text",
      text: "word1 word2 word3",
      fontFamily: "Arial",
      fontSize: 14,
      maxWidth: 50,
      style: {},
    });
    // Multiple fillText calls expected due to wrapping
    const fillTexts = calls.filter((c) => c.method === "fillText");
    expect(fillTexts.length).toBeGreaterThan(0);
  });

  it("handles explicit newlines in text", () => {
    const calls = addAndRender({
      ...base(),
      type: "text",
      text: "line1\nline2",
      fontFamily: "Arial",
      fontSize: 14,
      style: {},
    });
    const fillTexts = calls.filter((c) => c.method === "fillText");
    expect(fillTexts.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// drawImage
// ---------------------------------------------------------------------------
describe("drawImage", () => {
  it("calls drawImage with the shape dimensions", () => {
    const calls = addAndRender({
      ...base(),
      type: "image",
      src: "data:image/png;base64,abc",
      width: 200,
      height: 150,
      style: {},
    });
    expect(calls.some((c) => c.method === "drawImage")).toBe(true);
    const imgCall = calls.find((c) => c.method === "drawImage");
    expect(imgCall?.args[1]).toBe(0); // x
    expect(imgCall?.args[2]).toBe(0); // y
    expect(imgCall?.args[3]).toBe(200); // width
    expect(imgCall?.args[4]).toBe(150); // height
  });

  it("passes dynamic=false for a static (non-animated) image", () => {
    const calls = addAndRender({
      ...base(),
      type: "image",
      src: "data:image/png;base64,abc",
      width: 100,
      height: 80,
      style: {},
    });
    const imgCall = calls.find((c) => c.method === "drawImage");
    expect(imgCall?.args[5]).toBe(false);
  });

  it("passes dynamic=true for an animated image (metadata.animated)", () => {
    const calls = addAndRender({
      ...base(),
      type: "image",
      src: "data:image/gif;base64,abc",
      width: 100,
      height: 80,
      style: {},
      metadata: { animated: true },
    });
    const imgCall = calls.find((c) => c.method === "drawImage");
    expect(imgCall?.args[5]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// drawFrame
// ---------------------------------------------------------------------------
describe("drawFrame", () => {
  it("emits a dashed rect for the frame body", () => {
    const calls = addAndRender({
      ...base(),
      type: "frame",
      width: 400,
      height: 300,
      style: {},
    });
    // Frame draws: setDashArray → rect → stroke → setDashArray(null)
    expect(calls.some((c) => c.method === "setDashArray" && Array.isArray(c.args[0]))).toBe(true);
    expect(calls.some((c) => c.method === "rect" && c.args[2] === 400)).toBe(true);
    expect(calls.some((c) => c.method === "stroke")).toBe(true);
    // Dash array is reset after the body
    const dashCalls = calls.filter((c) => c.method === "setDashArray");
    expect(dashCalls.some((c) => c.args[0] === null)).toBe(true);
  });

  it("emits fillText with the frame name", () => {
    const calls = addAndRender({
      ...base(),
      type: "frame",
      width: 200,
      height: 150,
      name: "My Frame",
      style: {},
    });
    expect(calls.some((c) => c.method === "fillText" && c.args[0] === "My Frame")).toBe(true);
  });

  it("uses 'Frame' as default name when name is not set", () => {
    const calls = addAndRender({
      ...base(),
      type: "frame",
      width: 200,
      height: 150,
      style: {},
    });
    expect(calls.some((c) => c.method === "fillText" && c.args[0] === "Frame")).toBe(true);
  });

  it("header background uses a dark fill color", () => {
    const calls = addAndRender({
      ...base(),
      type: "frame",
      width: 200,
      height: 150,
      style: {},
    });
    // frame draws #222 for header bg
    expect(calls.some((c) => c.method === "setFill" && c.args[0] === "#222")).toBe(true);
  });

  it("header width is capped at min(160, shape.width)", () => {
    // wide frame — cap at 160
    const calls = addAndRender({
      ...base(),
      type: "frame",
      width: 400,
      height: 300,
      style: {},
    });
    // Header rect: rect(0, -FRAME_HEADER_HEIGHT, Math.min(160, width), FRAME_HEADER_HEIGHT)
    // args: [x=0, y=-24, w=160, h=24] — y (args[1]) is negative
    const headerRects = calls.filter((c) => c.method === "rect" && (c.args[1] as number) < 0);
    expect(headerRects.some((c) => c.args[2] === 160)).toBe(true);
  });

  it("header width equals shape.width when shape is narrow", () => {
    const calls = addAndRender({
      ...base(),
      type: "frame",
      width: 80,
      height: 100,
      style: {},
    });
    // args[1] is negative y (header is above the frame top)
    const headerRects = calls.filter((c) => c.method === "rect" && (c.args[1] as number) < 0);
    expect(headerRects.some((c) => c.args[2] === 80)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// drawBlockArrow
// ---------------------------------------------------------------------------
describe("drawBlockArrow", () => {
  const mkArrow = (direction?: "right" | "left" | "up" | "down", style = {}): Element =>
    ({
      ...base(),
      type: "block-arrow",
      width: 100,
      height: 60,
      direction,
      style,
    });

  it("emits moveTo + lineTo + fill for a filled right arrow", () => {
    const calls = addAndRender(mkArrow("right", { fill: "#f00" }));
    expect(calls.some((c) => c.method === "moveTo")).toBe(true);
    expect(calls.some((c) => c.method === "lineTo")).toBe(true);
    expect(calls.some((c) => c.method === "fill")).toBe(true);
  });

  it("emits stroke when stroke is configured", () => {
    const calls = addAndRender(mkArrow("right", { stroke: "#000" }));
    expect(calls.some((c) => c.method === "stroke")).toBe(true);
  });

  it("renders left direction without throwing", () => {
    const calls = addAndRender(mkArrow("left", { fill: "#f00" }));
    expect(calls.some((c) => c.method === "fill")).toBe(true);
  });

  it("renders up direction without throwing", () => {
    const calls = addAndRender(mkArrow("up", { fill: "#f00" }));
    expect(calls.some((c) => c.method === "fill")).toBe(true);
  });

  it("renders down direction without throwing", () => {
    const calls = addAndRender(mkArrow("down", { fill: "#f00" }));
    expect(calls.some((c) => c.method === "fill")).toBe(true);
  });

  it("defaults to right direction when direction is undefined", () => {
    const calls = addAndRender({
      ...base(),
      type: "block-arrow",
      width: 100,
      height: 60,
      style: { fill: "#0f0" },
    });
    expect(calls.some((c) => c.method === "fill")).toBe(true);
  });

  it("skips rendering when no fill and no stroke", () => {
    const calls = addAndRender(mkArrow("right", {}));
    expect(calls.some((c) => c.method === "fill")).toBe(false);
    expect(calls.some((c) => c.method === "stroke")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// drawBrush
// ---------------------------------------------------------------------------
describe("drawBrush", () => {
  it("skips rendering for empty points array", () => {
    const calls = addAndRender({
      ...base(),
      type: "brush",
      points: [],
      style: {},
    });
    expect(calls.some((c) => c.method === "fill")).toBe(false);
    expect(calls.some((c) => c.method === "ellipse")).toBe(false);
  });

  it("emits a single ellipse for a one-point brush stroke", () => {
    const calls = addAndRender({
      ...base(),
      type: "brush",
      points: [{ x: 10, y: 10, width: 5 }],
      style: { fill: "#000" },
    });
    expect(calls.some((c) => c.method === "ellipse")).toBe(true);
    expect(calls.some((c) => c.method === "fill")).toBe(true);
  });

  it("emits polygon segments + end-cap ellipses for multi-point stroke", () => {
    const calls = addAndRender({
      ...base(),
      type: "brush",
      points: [
        { x: 0, y: 0, width: 3 },
        { x: 20, y: 0, width: 3 },
        { x: 40, y: 10, width: 5 },
      ],
      style: { fill: "#333" },
    });
    // For N-1 segments: each emits moveTo + 3 lineTo + closePath + fill + ellipse + fill
    expect(calls.filter((c) => c.method === "fill").length).toBeGreaterThan(1);
    // End-cap ellipses
    expect(calls.filter((c) => c.method === "ellipse").length).toBeGreaterThan(0);
  });

  it("uses fill color from style.fill when set", () => {
    const calls = addAndRender({
      ...base(),
      type: "brush",
      points: [{ x: 0, y: 0, width: 4 }, { x: 10, y: 0, width: 4 }],
      style: { fill: "#abc" },
    });
    expect(calls.some((c) => c.method === "setFill" && c.args[0] === "#abc")).toBe(true);
  });

  it("falls back to style.stroke for fill color when fill is undefined", () => {
    const calls = addAndRender({
      ...base(),
      type: "brush",
      points: [{ x: 0, y: 0, width: 4 }, { x: 10, y: 0, width: 4 }],
      style: { stroke: "#f0f" },
    });
    expect(calls.some((c) => c.method === "setFill" && c.args[0] === "#f0f")).toBe(true);
  });

  it("sets stroke to null (brush uses filled quads, not stroked paths)", () => {
    const calls = addAndRender({
      ...base(),
      type: "brush",
      points: [{ x: 0, y: 0, width: 4 }, { x: 10, y: 0, width: 4 }],
      style: {},
    });
    expect(calls.some((c) => c.method === "setStroke" && c.args[0] === null)).toBe(true);
  });
});
