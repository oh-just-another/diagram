import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  getElement,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { handlePosition } from "../src/handle.js";

const frame = (id: string, w: number, h: number): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "frame",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    width: w,
    height: h,
    name: "Frame 1",
  }) as unknown as Element;

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
  resetTransform: () => {}, size: { width: 600, height: 600 },
} as never;

const makeHost = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (t: string, fn: (ev: unknown) => void) => handlers.set(t, fn),
    removeEventListener: (t: string) => handlers.delete(t),
    setPointerCapture: () => {}, releasePointerCapture: () => {}, hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 600 }),
    style: { cursor: "" },
  } as never;
  return { host, handlers };
};

const ptr = (type: string, x: number, y: number) => ({
  type, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", button: 0,
  buttons: type === "pointerup" ? 0 : 1,
  shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
  timeStamp: 0, preventDefault: () => {},
});

describe("frame resize gesture (end-to-end through pointer)", () => {
  it("dragging the SE handle of a selected frame resizes it", () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget,
      initialScene: sceneWith(frame("f", 200, 200)),
    });
    editor.setSnapToGrid(false); // deterministic deltas
    editor.applyEmit({ type: "SELECT_REPLACE", id: elementId("f") });

    // SE handle sits just outside the bottom-right corner.
    const se = handlePosition("se", { x: 0, y: 0, width: 200, height: 200 });
    handlers.get("pointerdown")!(ptr("pointerdown", se.x, se.y));
    handlers.get("pointermove")!(ptr("pointermove", se.x + 60, se.y + 40));
    handlers.get("pointerup")!(ptr("pointerup", se.x + 60, se.y + 40));

    const f = getElement(editor.scene, elementId("f")) as Element & {
      width: number;
      height: number;
    };
    expect(f.width).toBe(260);
    expect(f.height).toBe(240);
  });
});
