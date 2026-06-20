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

const rect = (id: string, x: number, y: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 40,
  height: 40,
});

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const noopTarget = {
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
  setFont: () => {},
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
  measureText: () => ({ width: 0 }),
  drawImage: () => {},
  translate: () => {},
  rotate: () => {},
  scale: () => {},
  resetTransform: () => {},
  size: { width: 400, height: 400 },
} as never;

const makeHost = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (type: string, fn: (ev: unknown) => void) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    style: { cursor: "" },
  } as never;
  return { host, handlers };
};

const ptr = (type: string, x: number, y: number, pointerType = "touch") => ({
  type,
  clientX: x,
  clientY: y,
  pointerId: 1,
  pointerType,
  button: 0,
  buttons: type === "pointerup" ? 0 : 1,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  pressure: 0.5,
  timeStamp: 0,
  preventDefault: () => {},
});

describe("one-finger touch pan", () => {
  const setup = () => {
    const { host, handlers } = makeHost();
    // A small rect at (0,0); empty space is anywhere away from it.
    const editor = new Editor({
      host,
      mainTarget: noopTarget,
      overlayTarget: noopTarget,
      initialScene: sceneWith(rect("a", 0, 0)),
    });
    const fire = (t: string, x: number, y: number, pt = "touch") =>
      handlers.get(t)!(ptr(t, x, y, pt));
    return { editor, fire };
  };

  it("dragging empty canvas with one finger pans the viewport (not a lasso)", () => {
    const { editor, fire } = setup();
    const pan0 = { ...editor.scene.viewport.pan };
    // Press on empty space (200,200), drag well past slop.
    fire("pointerdown", 200, 200);
    fire("pointermove", 260, 230);
    fire("pointermove", 300, 250);
    fire("pointerup", 300, 250);
    const pan1 = editor.scene.viewport.pan;
    // Viewport moved, and nothing got selected (no marquee selection).
    expect(pan1.x !== pan0.x || pan1.y !== pan0.y).toBe(true);
    expect(editor.selection.size).toBe(0);
  });

  it("a tap on empty still deselects (no pan)", () => {
    const { editor, fire } = setup();
    editor.applyEmit({ type: "SELECT_REPLACE", id: elementId("a") });
    expect(editor.selection.size).toBe(1);
    const pan0 = { ...editor.scene.viewport.pan };
    // Tap (down + up, no move) on empty space.
    fire("pointerdown", 200, 200);
    fire("pointerup", 200, 200);
    expect(editor.selection.size).toBe(0); // deselected
    expect(editor.scene.viewport.pan).toEqual(pan0); // no pan
  });

  it("mouse one-button drag on empty does NOT pan (still a marquee)", () => {
    const { editor, fire } = setup();
    const pan0 = { ...editor.scene.viewport.pan };
    fire("pointerdown", 200, 200, "mouse");
    fire("pointermove", 280, 240, "mouse");
    fire("pointerup", 280, 240, "mouse");
    expect(editor.scene.viewport.pan).toEqual(pan0); // mouse unchanged
  });
});
