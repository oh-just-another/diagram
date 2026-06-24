import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
  type TextElement,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const textElement = (id: string, text = "hello"): TextElement => ({
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

const rect = (id: string): Element => ({
  id: elementId(id),
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

const sceneWith = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of elements) s = addElement(s, sh).scene;
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
  size: { width: 100, height: 100 },
} as never;

const host = {
  addEventListener: () => {},
  removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  style: { cursor: "" },
} as never;

const makeEditor = (scene: Scene): Editor =>
  new Editor({ host, mainTarget: noopTarget, overlayTarget: noopTarget, initialScene: scene });

describe("inline text edit", () => {
  it("beginTextEdit sets editingTextElement only for text shapes", () => {
    const e = makeEditor(sceneWith(textElement("t1"), rect("r1")));
    e.beginTextEdit(elementId("r1"));
    expect(e.editingTextElement).toBeNull();
    e.beginTextEdit(elementId("t1"));
    expect(e.editingTextElement).toBe(elementId("t1"));
  });

  it("commitTextEdit replaces text and clears the edit slot", () => {
    const e = makeEditor(sceneWith(textElement("t1", "old")));
    e.beginTextEdit(elementId("t1"));
    e.commitTextEdit("new");
    expect(e.editingTextElement).toBeNull();
    expect((e.scene.elements.get(elementId("t1")) as TextElement).text).toBe("new");
  });

  it("commitTextEdit with identical text does not push a history step", () => {
    const e = makeEditor(sceneWith(textElement("t1", "same")));
    const before = e.canUndo;
    e.beginTextEdit(elementId("t1"));
    e.commitTextEdit("same");
    expect(e.editingTextElement).toBeNull();
    // canUndo unchanged — no patch was pushed for a no-op commit.
    expect(e.canUndo).toBe(before);
  });

  it("cancelTextEdit clears the slot without mutating the scene", () => {
    const e = makeEditor(sceneWith(textElement("t1", "keep")));
    e.beginTextEdit(elementId("t1"));
    e.cancelTextEdit();
    expect(e.editingTextElement).toBeNull();
    expect((e.scene.elements.get(elementId("t1")) as TextElement).text).toBe("keep");
  });

  it("commit creates a single undo step", () => {
    const e = makeEditor(sceneWith(textElement("t1", "before")));
    e.beginTextEdit(elementId("t1"));
    e.commitTextEdit("after");
    expect(e.canUndo).toBe(true);
    e.undo();
    expect((e.scene.elements.get(elementId("t1")) as TextElement).text).toBe("before");
  });

  it("scales caret + selection geometry with the element's scale", () => {
    // A measuring target so the layout has real, non-zero widths.
    const measuringTarget = {
      ...(noopTarget as Record<string, unknown>),
      measureText: (t: string) => ({ width: t.length * 10 }),
    } as never;
    const scaled: TextElement = { ...textElement("t1", "hi"), scale: { x: 2, y: 2 } };
    const e = new Editor({
      host,
      mainTarget: measuringTarget,
      overlayTarget: measuringTarget,
      initialScene: sceneWith(scaled),
    });
    e.beginTextEdit(elementId("t1"));
    e.setEditingText("hi", 0, 2); // select the whole word

    const overlay = e.editingTextOverlay();
    expect(overlay).not.toBeNull();
    // "hi" measures to width 20 in local space; at scale 2 the selection
    // rectangle that hugs it must be ~40 wide, not the unscaled 20.
    const selWidth = overlay!.selectionRects[0]?.width ?? 0;
    expect(selWidth).toBeCloseTo(40, 0);
  });

  it("maps a world click back through scale to the right caret index", () => {
    const measuringTarget = {
      ...(noopTarget as Record<string, unknown>),
      measureText: (t: string) => ({ width: t.length * 10 }),
    } as never;
    const scaled: TextElement = { ...textElement("t1", "abcd"), scale: { x: 2, y: 2 } };
    const e = new Editor({
      host,
      mainTarget: measuringTarget,
      overlayTarget: measuringTarget,
      initialScene: sceneWith(scaled),
    });
    e.beginTextEdit(elementId("t1"));
    // World x=40 → local x=20 (÷ scale 2) → 2 chars in at 10px each.
    expect(e.caretIndexAtWorldPoint({ x: 40, y: 5 })).toBe(2);
  });
});
