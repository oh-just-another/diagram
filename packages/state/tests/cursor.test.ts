import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  getElementWorldBounds,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { cursorForHandle, handlePosition } from "../src/handle.js";

const rect = (id: string, x: number, y: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 80,
  height: 60,
});

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const noopTarget = {
  save: () => {}, restore: () => {}, setTransform: () => {}, clear: () => {},
  setFill: () => {}, setStroke: () => {}, setStrokeWidth: () => {},
  setOpacity: () => {}, setLineCap: () => {}, setLineJoin: () => {},
  setDashArray: () => {}, setFont: () => {}, setTextAlign: () => {},
  setTextBaseline: () => {}, beginPath: () => {}, closePath: () => {},
  moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {},
  bezierCurveTo: () => {}, rect: () => {}, ellipse: () => {},
  fill: () => {}, stroke: () => {}, fillText: () => {},
  measureText: () => ({ width: 0 }), drawImage: () => {},
  translate: () => {}, rotate: () => {}, scale: () => {},
  resetTransform: () => {}, size: { width: 400, height: 400 },
} as never;

const makeHost = () => {
  const host = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    style: { cursor: "" },
  } as never;
  return host;
};

const makeEditor = (...els: Element[]): Editor =>
  new Editor({
    host: makeHost(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: sceneWith(...els),
  });

const cursorOf = (e: Editor): string => (e as unknown as { host: { style: { cursor: string } } }).host.style.cursor;

describe("cursorForHandle", () => {
  it("maps handles to the resize-axis arrow", () => {
    expect(cursorForHandle("nw")).toBe("nwse-resize");
    expect(cursorForHandle("se")).toBe("nwse-resize");
    expect(cursorForHandle("ne")).toBe("nesw-resize");
    expect(cursorForHandle("sw")).toBe("nesw-resize");
    expect(cursorForHandle("n")).toBe("ns-resize");
    expect(cursorForHandle("s")).toBe("ns-resize");
    expect(cursorForHandle("e")).toBe("ew-resize");
    expect(cursorForHandle("w")).toBe("ew-resize");
  });
});

describe("context cursor", () => {
  it("draw tools show crosshair / text", () => {
    const e = makeEditor(rect("a", 0, 0));
    e.setMode("draw-rect");
    expect(cursorOf(e)).toBe("crosshair");
    e.setMode("draw-text");
    expect(cursorOf(e)).toBe("text");
    e.setMode("draw-edge");
    expect(cursorOf(e)).toBe("crosshair");
  });

  it("hand mode shows grab", () => {
    const e = makeEditor(rect("a", 0, 0));
    e.setMode("hand");
    expect(cursorOf(e)).toBe("grab");
  });

  it("empty canvas hover is default", () => {
    const e = makeEditor(rect("a", 0, 0));
    e.refreshCursor({ x: 1000, y: 1000 });
    expect(cursorOf(e)).toBe("default");
  });

  it("hovering a resize handle of the single selection shows the resize arrow", () => {
    const e = makeEditor(rect("a", 0, 0));
    e.setSelection([elementId("a")]);
    const bounds = getElementWorldBounds(e.scene.elements.get(elementId("a"))!);
    const se = handlePosition("se", bounds, e.scene.viewport.zoom);
    e.refreshCursor(se);
    expect(cursorOf(e)).toBe("nwse-resize");
  });

  it("hovering a link-start dot of the selected element shows crosshair", () => {
    const e = makeEditor(rect("a", 0, 0));
    e.setSelection([elementId("a")]);
    // The right-edge start dot sits just outside the right edge, mid-height.
    const b = getElementWorldBounds(e.scene.elements.get(elementId("a"))!);
    const rightDot = { x: b.x + b.width + 20, y: b.y + b.height / 2 };
    e.refreshCursor(rightDot);
    expect(cursorOf(e)).toBe("crosshair");
  });
});
