import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type TextElement,
} from "@oh-just-another/scene";
import { installBuiltinRenderers } from "@oh-just-another/renderer-core";
import { Editor } from "../src/editor.js";

installBuiltinRenderers();

let rafQueue: FrameRequestCallback[] = [];
const flushRAF = () => {
  for (let i = 0; i < 20 && rafQueue.length > 0; i++) {
    const batch = rafQueue;
    rafQueue = [];
    for (const cb of batch) cb(performance.now());
  }
};
beforeEach(() => {
  rafQueue = [];
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
    cb: FrameRequestCallback,
  ) => {
    rafQueue.push(cb);
    return 1;
  };
  (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = () => {};
});
afterEach(() => {
  delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
});

interface FontCall {
  family: string;
  size: number;
  options?: { weight?: string; style?: string };
}
const recordingTarget = () => {
  const fonts: FontCall[] = [];
  const t = {
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    clear: () => {},
    setFill: () => {},
    setStroke: () => {},
    setStrokeWidth: () => {},
    setOpacity: () => {},
    setLineCap: () => {},
    setLineJoin: () => {},
    setDashArray: () => {},
    setFont: (family: string, size: number, options?: { weight?: string; style?: string }) => {
      fonts.push({ family, size, ...(options ? { options } : {}) });
    },
    setTextAlign: () => {},
    setTextBaseline: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    bezierCurveTo: () => {},
    rect: () => {},
    ellipse: () => {},
    fill: () => {},
    stroke: () => {},
    fillText: () => {},
    measureText: (s: string) => ({ width: s.length * 7 }),
    drawImage: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    resetTransform: () => {},
    size: { width: 800, height: 600 },
  };
  return { target: t as never, fonts };
};

const host = {
  addEventListener: () => {},
  removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  style: { cursor: "" },
} as never;

const textEl = (): TextElement => ({
  id: elementId("t"),
  layerId: DEFAULT_LAYER_ID,
  type: "text",
  position: { x: 100, y: 100 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  text: "Hello world",
  fontFamily: "sans-serif",
  fontSize: 20,
});

const renderFonts = (partial: Parameters<Editor["applyTextStyleToRange"]>[3]): FontCall[] => {
  const { scene } = addElement(emptyScene(), textEl());
  const main = recordingTarget();
  const editor = new Editor({
    host,
    mainTarget: main.target,
    overlayTarget: recordingTarget().target,
    initialScene: scene,
  });
  editor.setViewportSize(800, 600);
  flushRAF();

  editor.applyTextStyleToRange(elementId("t"), 0, 5, partial);
  main.fonts.length = 0;
  editor.forceRender();
  flushRAF();
  return main.fonts;
};

describe("styled text runs reach the renderer through the full editor render", () => {
  it("emits a bold setFont for a range styled with fontWeight: 'bold'", () => {
    const fonts = renderFonts({ fontWeight: "bold" });
    expect(fonts.some((f) => f.options?.weight === "bold")).toBe(true);
  });

  it("emits an italic setFont for a range styled with fontStyle: 'italic'", () => {
    const fonts = renderFonts({ fontStyle: "italic" });
    expect(fonts.some((f) => f.options?.style === "italic")).toBe(true);
  });

  it("emits no bold setFont when only the fill of a range changes", () => {
    const fonts = renderFonts({ fill: "#f00" });
    expect(fonts.every((f) => f.options?.weight !== "bold")).toBe(true);
  });
});
