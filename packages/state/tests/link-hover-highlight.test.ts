import { describe, expect, it } from "vitest";
import { linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addLink,
  emptyScene,
  orderBetween,
  type Scene,
  type Link,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const horizontalLink = (): Link => ({
  id: linkId("L"),
  layerId: DEFAULT_LAYER_ID,
  from: { kind: "point", position: { x: 0, y: 100 } },
  to: { kind: "point", position: { x: 200, y: 100 } },
  order: orderBetween(null, null),
  style: { stroke: "#000" },
});

const sceneWith = (link: Link): Scene => addLink(emptyScene(), link).scene;

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
    setPointerCapture: () => {}, releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: { cursor: "" },
  } as never;
  return { host, handlers };
};

const pointer = (type: string, x: number, y: number) => ({
  type, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", button: 0,
  buttons: 0,
  shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
  timeStamp: 0, preventDefault: () => {},
});

describe("link body hover highlight", () => {
  it("hovering a link body marks it hovered; leaving clears it", () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget,
      initialScene: sceneWith(horizontalLink()),
    });
    const move = (x: number, y: number) => handlers.get("pointermove")!(pointer("pointermove", x, y));

    expect(editor.hoveredLink).toBeNull();
    move(100, 100); // over the link body
    expect(editor.hoveredLink).toBe(linkId("L"));
    move(100, 400); // empty space
    expect(editor.hoveredLink).toBeNull();
  });
});
