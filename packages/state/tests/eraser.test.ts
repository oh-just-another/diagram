import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  orderBetween,
  emptyScene,
  type Element,
  type Scene,
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
  style: {},
  width: 40,
  height: 40,
});

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
  bezierCurveTo: () => {},
  quadraticCurveTo: () => {},
  rect: () => {},
  ellipse: () => {},
  fill: () => {},
  stroke: () => {},
  fillText: () => {},
  measureText: () => ({ width: 0 }),
  drawImage: () => {},
  drawPoint: () => {},
  scale: () => {},
  translate: () => {},
  rotate: () => {},
} as never;

const makeEditor = (scene: Scene): Editor =>
  new Editor({
    host: {
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
      style: {},
    } as never,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

describe("eraser tool", () => {
  it("sweeps shapes along the drag into a pending set and deletes them on release", () => {
    // Two rects on a horizontal row; a third far away, off the path.
    const a = rect("a", 0, 0); // covers 0..40
    const b = rect("b", 100, 0); // covers 100..140
    const far = rect("far", 0, 300); // way below the sweep line
    const editor = makeEditor(sceneWith(a, b, far));
    editor.setMode("erase");

    // Drag from inside `a` to inside `b` along y≈20.
    editor.beginEraseStroke({ x: 20, y: 20 });
    editor.extendEraseStroke({ x: 120, y: 20 });

    // Both swept shapes are pending; the off-path shape is not.
    expect([...editor.pendingErase].sort()).toEqual(["a", "b"]);
    // Nothing deleted yet (preview only).
    expect(editor.scene.elements.size).toBe(3);

    const removed = editor.commitEraseStroke();
    expect(removed).toBe(2);
    expect(editor.scene.elements.has(elementId("a"))).toBe(false);
    expect(editor.scene.elements.has(elementId("b"))).toBe(false);
    expect(editor.scene.elements.has(elementId("far"))).toBe(true);
    expect(editor.pendingErase.size).toBe(0);
  });

  it("deletes an entire stroke in ONE undo step (undo restores every shape)", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0), rect("b", 100, 0)));
    editor.setMode("erase");
    editor.beginEraseStroke({ x: 20, y: 20 });
    editor.extendEraseStroke({ x: 120, y: 20 });
    editor.commitEraseStroke();
    expect(editor.scene.elements.size).toBe(0);

    // A single undo brings back BOTH shapes (one transaction).
    editor.undo();
    expect(editor.scene.elements.size).toBe(2);
    expect(editor.scene.elements.has(elementId("a"))).toBe(true);
    expect(editor.scene.elements.has(elementId("b"))).toBe(true);
  });

  it("does not touch shapes outside the eraser path", () => {
    const editor = makeEditor(sceneWith(rect("hit", 0, 0), rect("miss", 200, 200)));
    editor.setMode("erase");
    editor.beginEraseStroke({ x: 20, y: 20 });
    editor.extendEraseStroke({ x: 30, y: 25 });
    editor.commitEraseStroke();
    expect(editor.scene.elements.has(elementId("hit"))).toBe(false);
    expect(editor.scene.elements.has(elementId("miss"))).toBe(true);
  });

  it("cancel aborts the stroke without deleting", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0)));
    editor.setMode("erase");
    editor.beginEraseStroke({ x: 20, y: 20 });
    expect(editor.pendingErase.size).toBe(1);
    editor.cancelEraseStroke();
    expect(editor.eraseStroke).toBeNull();
    expect(editor.scene.elements.size).toBe(1);
  });
});
