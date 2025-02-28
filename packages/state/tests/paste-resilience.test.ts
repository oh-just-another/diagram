import { describe, expect, it } from "vitest";
import { shapeId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addShape,
  emptyScene,
  orderBetween,
  type Scene,
  type Shape,
} from "@oh-just-another/scene";
import { History } from "@oh-just-another/history";
import { Editor } from "../src/editor.js";

const rect = (id: string): Shape => ({
  id: shapeId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 50,
  height: 50,
});

const sceneWith = (...shapes: Shape[]): Scene => {
  let s = emptyScene();
  for (const sh of shapes) s = addShape(s, sh).scene;
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
  resetTransform: () => {}, size: { width: 100, height: 100 },
} as never;

const host = {
  addEventListener: () => {}, removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  style: { cursor: "" },
} as never;

const makeEditor = (history?: History): Editor =>
  new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: sceneWith(rect("a")),
    ...(history ? { history } : {}),
  });

describe("paste resilience to leaked transactions", () => {
  it("paste called twice in a row does not throw on the second call", () => {
    const e = makeEditor();
    e.setSelection([shapeId("a")]);
    e.copySelected();
    expect(() => e.paste()).not.toThrow();
    // Second paste must not see a leaked transaction.
    expect(() => e.paste()).not.toThrow();
  });

  it("paste commits a leaked gestureTx instead of throwing", () => {
    const history = new History();
    const e = makeEditor(history);
    e.setSelection([shapeId("a")]);
    e.copySelected();

    // Simulate a gesture that opened a transaction but never committed, by
    // directly opening one on the history. paste should commit it and
    // continue without throwing.
    const leaked = history.transaction();
    leaked.add({
      kind: "shape",
      id: shapeId("a"),
      before: rect("a"),
      after: { ...rect("a"), position: { x: 100, y: 100 } },
    });
    // History.current is now non-null; without finalizeOpenGestureTx
    // paste's internal transaction() throws "already open".
    expect(() => e.paste()).not.toThrow();
  });

  it("paste of N shapes lands as one undo step", () => {
    const history = new History();
    const e = makeEditor(history);
    e.setSelection([shapeId("a")]);
    e.copySelected();
    const before = history.undoStack.length;
    e.paste();
    const after = history.undoStack.length;
    // Exactly one stack item appeared, not N: pasteShapes pushes a
    // batched patch instead of N separate pushes.
    expect(after - before).toBe(1);
    // And undo returns the scene to its previous state in one step.
    e.undo();
    expect(e.scene.shapes.size).toBe(1);
  });
});
