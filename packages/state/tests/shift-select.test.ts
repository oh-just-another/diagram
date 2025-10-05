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

const rect = (id: string, x: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 40,
  height: 40,
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
  resetTransform: () => {}, size: { width: 200, height: 200 },
} as never;

/** Host that captures pointer listeners so the test can dispatch taps. */
const makeHost = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (type: string, fn: (ev: unknown) => void) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
    style: { cursor: "" },
  } as never;
  return { host, handlers };
};

const pointer = (type: string, x: number, y: number, shift = false) => ({
  type,
  clientX: x,
  clientY: y,
  pointerId: 1,
  pointerType: "mouse",
  button: 0,
  buttons: type === "pointerup" ? 0 : 1,
  shiftKey: shift,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  timeStamp: 0,
  preventDefault: () => {},
});

describe("shift-click multi-select", () => {
  // Two rects: A centred at (20,20), B at (120,20). Viewport is identity
  // (zoom 1, pan 0) and the host rect is at the origin, so client coords
  // equal world coords.
  const setup = () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host,
      mainTarget: noopTarget,
      overlayTarget: noopTarget,
      initialScene: sceneWith(rect("a", 0), rect("b", 100)),
    });
    const tap = (x: number, y: number, shift = false) => {
      handlers.get("pointerdown")!(pointer("pointerdown", x, y, shift));
      handlers.get("pointerup")!(pointer("pointerup", x, y, shift));
    };
    return { editor, tap };
  };

  it("shift-click adds a second shape to the selection", () => {
    const { editor, tap } = setup();
    tap(20, 20); // plain click A
    expect([...editor.selection]).toEqual([elementId("a")]);
    tap(120, 20, true); // shift-click B
    expect(new Set(editor.selection)).toEqual(new Set([elementId("a"), elementId("b")]));
  });

  it("shift-click an already-selected shape removes it (toggle off)", () => {
    const { editor, tap } = setup();
    tap(20, 20); // A
    tap(120, 20, true); // +B → {A,B}
    tap(20, 20, true); // shift-click A again → remove A
    expect([...editor.selection]).toEqual([elementId("b")]);
  });

  it("plain click replaces the selection", () => {
    const { editor, tap } = setup();
    tap(20, 20); // A
    tap(120, 20, true); // {A,B}
    tap(120, 20); // plain click B → replace → {B}
    expect([...editor.selection]).toEqual([elementId("b")]);
  });
});
