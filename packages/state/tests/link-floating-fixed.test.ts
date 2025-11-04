import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

// Two rects. "a" at origin (40×40, centre 20,20), "b" to the right
// (200..280 × 0..80, centre 240,40). Edges/anchors of "b": left (200,40),
// right (280,40), top (240,0), bottom (240,80), centre (240,40).
const rect = (id: string, x: number, y: number, w: number, h: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: w,
  height: h,
});

const sceneWith = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of elements) s = addElement(s, sh).scene;
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
  resetTransform: () => {}, size: { width: 800, height: 600 },
} as never;

const makeHost = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (type: string, fn: (ev: unknown) => void) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: { cursor: "" },
  } as never;
  return { host, handlers };
};

const pointer = (type: string, x: number, y: number) => ({
  type,
  clientX: x,
  clientY: y,
  pointerId: 1,
  pointerType: "mouse",
  button: 0,
  buttons: type === "pointerup" ? 0 : 1,
  shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
  timeStamp: 0,
  preventDefault: () => {},
});

const drawFromDot = (
  to: { x: number; y: number },
): { from: string; to: string; toEl: string | undefined } => {
  const { host, handlers } = makeHost();
  const editor = new Editor({
    host, mainTarget: noopTarget, overlayTarget: noopTarget,
    initialScene: sceneWith(rect("a", 0, 0, 40, 40), rect("b", 200, 0, 80, 80)),
  });
  const down = (x: number, y: number) => handlers.get("pointerdown")!(pointer("pointerdown", x, y));
  const move = (x: number, y: number) => handlers.get("pointermove")!(pointer("pointermove", x, y));
  const up = (x: number, y: number) => handlers.get("pointerup")!(pointer("pointerup", x, y));

  down(20, 20); up(20, 20); // select A
  down(48, 20); // press A's right link-start dot (outset 8 px from x=40)
  move(to.x, to.y); // drag onto B
  up(to.x, to.y);

  const link = [...editor.scene.links.values()][0]!;
  const ep = link.to as { kind: string; elementId?: string };
  return {
    from: link.from.kind,
    to: link.to.kind,
    toEl: ep.elementId,
  };
};

describe("link endpoint attach: floating (body) vs fixed (dot)", () => {
  it("dropping on the shape body floats against the whole shape", () => {
    // (220,20) is inside B and > 12 px (snap threshold) from every anchor.
    const r = drawFromDot({ x: 220, y: 20 });
    expect(r.to).toBe("floating");
    expect(r.toEl).toBe("b");
    expect(r.from).toBe("anchor"); // start stays fixed to the grabbed dot
  });

  it("dropping near an edge anchor fixes to that anchor", () => {
    // (203,40) is inside B and ~3 px from its left edge-midpoint anchor.
    const r = drawFromDot({ x: 203, y: 40 });
    expect(r.to).toBe("anchor");
    expect(r.toEl).toBe("b");
  });
});
