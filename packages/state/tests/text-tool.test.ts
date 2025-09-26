import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addShape,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type TextElement,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const textShape = (id: string, text = "hi"): TextElement => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "text",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  text,
  fontFamily: "Arial",
  fontSize: 14,
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
  size: { width: 100, height: 100 },
} as never;

const host = {
  addEventListener: () => {},
  removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  style: { cursor: "" },
} as never;

const makeEditor = (scene: Scene = emptyScene()): Editor =>
  new Editor({ host, mainTarget: noopTarget, overlayTarget: noopTarget, initialScene: scene });

describe("draw-text tool", () => {
  it("createTextAt places an empty text shape, selects it and opens the editor", () => {
    const e = makeEditor();
    const id = e.createTextAt({ x: 40, y: 60 });
    const shape = e.scene.shapes.get(id) as TextElement | undefined;
    expect(shape?.type).toBe("text");
    expect(shape?.text).toBe("");
    expect(shape?.position).toEqual({ x: 40, y: 60 });
    expect(e.selection.has(id)).toBe(true);
    expect(e.editingTextShape).toBe(id);
  });

  it("a pending creation is not on the undo stack until committed", () => {
    const e = makeEditor();
    e.createTextAt({ x: 0, y: 0 });
    // Placeholder exists in the scene but nothing is undoable yet.
    expect(e.scene.shapes.size).toBe(1);
    expect(e.canUndo).toBe(false);
  });

  it("committing non-empty text finalises the shape as a single undo step", () => {
    const e = makeEditor();
    const id = e.createTextAt({ x: 0, y: 0 });
    e.commitTextEdit("hello world");
    expect((e.scene.shapes.get(id) as TextElement).text).toBe("hello world");
    expect(e.editingTextShape).toBeNull();
    expect(e.canUndo).toBe(true);
    // One undo removes the whole shape, not just the text.
    e.undo();
    expect(e.scene.shapes.size).toBe(0);
  });

  it("committing empty text removes the pending shape with no history entry", () => {
    const e = makeEditor();
    e.createTextAt({ x: 0, y: 0 });
    e.commitTextEdit("   ");
    expect(e.scene.shapes.size).toBe(0);
    expect(e.editingTextShape).toBeNull();
    expect(e.canUndo).toBe(false);
  });

  it("cancelling a pending creation removes the shape with no history entry", () => {
    const e = makeEditor();
    e.createTextAt({ x: 0, y: 0 });
    e.cancelTextEdit();
    expect(e.scene.shapes.size).toBe(0);
    expect(e.editingTextShape).toBeNull();
    expect(e.canUndo).toBe(false);
  });

  it("cancelling an existing text edit keeps the shape intact", () => {
    const e = makeEditor();
    let s = e.scene;
    s = addShape(s, textShape("t1", "keep")).scene;
    const e2 = makeEditor(s);
    e2.beginTextEdit(elementId("t1"));
    e2.cancelTextEdit();
    expect((e2.scene.shapes.get(elementId("t1")) as TextElement).text).toBe("keep");
  });

  it("updateTextProps changes fontSize on text shapes only", () => {
    const e = makeEditor();
    const id = e.createTextAt({ x: 0, y: 0 });
    e.commitTextEdit("x");
    e.updateTextProps([id], { fontSize: 48 });
    expect((e.scene.shapes.get(id) as TextElement).fontSize).toBe(48);
  });

  it("updateStyle writes textAlign through to a text shape", () => {
    const e = makeEditor();
    const id = e.createTextAt({ x: 0, y: 0 });
    e.commitTextEdit("x");
    e.updateStyle([id], { textAlign: "center" });
    expect((e.scene.shapes.get(id) as TextElement).style.textAlign).toBe("center");
  });
});
