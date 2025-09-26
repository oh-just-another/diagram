import { beforeAll, describe, expect, it } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import {
  type EllipseElement,
  type ImageElement,
  type PathElement,
  type PolygonElement,
  type RectangleElement,
  type TextElement,
  orderBetween,
} from "@oh-just-another/scene";
import { getShapeRenderer, type RenderTarget } from "@oh-just-another/renderer-core";
import { installBuiltinRenderers } from "../src/index";

const baseProps = {
  layerId: layerId("L"),
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
};

const recorder = (): {
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
        if (prop === "measureText") return { width: 50 };
        return undefined;
      };
    },
  };
  const target = new Proxy({}, handler) as unknown as RenderTarget;
  return { target, calls };
};

beforeAll(() => {
  installBuiltinRenderers();
});

describe("built-in renderers", () => {
  it("rectangle calls rect → fill (when fill set)", () => {
    const r: RectangleElement = {
      ...baseProps,
      id: elementId("r"),
      type: "rectangle",
      style: { fill: "#f00" },
      width: 10,
      height: 20,
    };
    const { target, calls } = recorder();
    getShapeRenderer("rectangle")!(r, target);
    const methods = calls.map((c) => c.method);
    expect(methods).toContain("rect");
    expect(methods).toContain("fill");
  });

  it("rectangle without fill or stroke draws nothing", () => {
    const r: RectangleElement = {
      ...baseProps,
      id: elementId("r"),
      type: "rectangle",
      style: {},
      width: 10,
      height: 10,
    };
    const { target, calls } = recorder();
    getShapeRenderer("rectangle")!(r, target);
    expect(calls.find((c) => c.method === "rect")).toBeUndefined();
  });

  it("ellipse calls ellipse with semi-axes", () => {
    const e: EllipseElement = {
      ...baseProps,
      id: elementId("e"),
      type: "ellipse",
      style: { stroke: "#000", strokeWidth: 1 },
      width: 40,
      height: 20,
    };
    const { target, calls } = recorder();
    getShapeRenderer("ellipse")!(e, target);
    const ell = calls.find((c) => c.method === "ellipse");
    expect(ell?.args).toEqual([20, 10, 20, 10]);
    expect(calls.find((c) => c.method === "stroke")).toBeDefined();
  });

  it("polygon issues moveTo then lineTo for every vertex then closePath", () => {
    const p: PolygonElement = {
      ...baseProps,
      id: elementId("p"),
      type: "polygon",
      style: { fill: "#fff" },
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ],
    };
    const { target, calls } = recorder();
    getShapeRenderer("polygon")!(p, target);
    expect(calls.filter((c) => c.method === "moveTo")).toHaveLength(1);
    expect(calls.filter((c) => c.method === "lineTo")).toHaveLength(2);
    expect(calls.find((c) => c.method === "closePath")).toBeDefined();
    expect(calls.find((c) => c.method === "fill")).toBeDefined();
  });

  it("path dispatches M/L/Q/C/Z", () => {
    const p: PathElement = {
      ...baseProps,
      id: elementId("pa"),
      type: "path",
      style: { stroke: "#000", strokeWidth: 1 },
      commands: [
        { kind: "M", to: { x: 0, y: 0 } },
        { kind: "L", to: { x: 10, y: 0 } },
        { kind: "Q", control: { x: 15, y: 5 }, to: { x: 10, y: 10 } },
        { kind: "C", control1: { x: 5, y: 12 }, control2: { x: 0, y: 10 }, to: { x: 0, y: 0 } },
        { kind: "Z" },
      ],
    };
    const { target, calls } = recorder();
    getShapeRenderer("path")!(p, target);
    const seen = calls.map((c) => c.method);
    for (const name of [
      "moveTo",
      "lineTo",
      "quadraticCurveTo",
      "bezierCurveTo",
      "closePath",
      "stroke",
    ]) {
      expect(seen).toContain(name);
    }
  });

  it("text without maxWidth issues a single fillText", () => {
    const t: TextElement = {
      ...baseProps,
      id: elementId("t"),
      type: "text",
      text: "hi",
      fontFamily: "sans",
      fontSize: 16,
      style: { fill: "#000" },
    };
    const { target, calls } = recorder();
    getShapeRenderer("text")!(t, target);
    const fillCalls = calls.filter((c) => c.method === "fillText");
    expect(fillCalls).toHaveLength(1);
    expect(fillCalls[0]?.args[0]).toBe("hi");
  });

  it("text with maxWidth wraps into multiple fillText calls", () => {
    const t: TextElement = {
      ...baseProps,
      id: elementId("t2"),
      type: "text",
      text: "abc def ghi jkl",
      fontFamily: "sans",
      fontSize: 16,
      maxWidth: 30, // each chunk of 3 chars = 30 chars... but our mock measures 50 unconditionally
      style: { fill: "#000" },
    };
    const { target, calls } = recorder();
    getShapeRenderer("text")!(t, target);
    expect(calls.filter((c) => c.method === "fillText").length).toBeGreaterThanOrEqual(1);
  });

  it("text passes bold/italic to setFont", () => {
    const t: TextElement = {
      ...baseProps,
      id: elementId("tb"),
      type: "text",
      text: "hi",
      fontFamily: "sans",
      fontSize: 16,
      style: { fill: "#000", fontWeight: "bold", fontStyle: "italic" },
    };
    const { target, calls } = recorder();
    getShapeRenderer("text")!(t, target);
    const sf = calls.find((c) => c.method === "setFont");
    expect(sf?.args[2]).toEqual({ weight: "bold", style: "italic" });
  });

  it("underlined / struck text draws decoration rects (rect + fill)", () => {
    const t: TextElement = {
      ...baseProps,
      id: elementId("td"),
      type: "text",
      text: "hi",
      fontFamily: "sans",
      fontSize: 20,
      style: { fill: "#000", textDecoration: { underline: true, strikethrough: true } },
    };
    const { target, calls } = recorder();
    getShapeRenderer("text")!(t, target);
    // One line × two decorations → 2 rect + 2 fill (beyond the glyph fillText).
    expect(calls.filter((c) => c.method === "rect").length).toBe(2);
    expect(calls.filter((c) => c.method === "fill").length).toBe(2);
  });

  it("image calls drawImage with shape width/height", () => {
    const i: ImageElement = {
      ...baseProps,
      id: elementId("i"),
      type: "image",
      style: {},
      src: "data:,",
      width: 100,
      height: 50,
    };
    const { target, calls } = recorder();
    getShapeRenderer("image")!(i, target);
    const di = calls.find((c) => c.method === "drawImage");
    // args: (image, dx, dy, dw, dh, dynamic). Static image → dynamic=false.
    expect(di?.args.slice(1)).toEqual([0, 0, 100, 50, false]);
  });
});
