import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  getElement,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const frame = (id: string, name?: string): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "frame",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    width: 200,
    height: 200,
    ...(name !== undefined ? { name } : {}),
  }) as unknown as Element;

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const noopTarget = new Proxy(
  { measureText: () => ({ width: 0 }), size: { width: 400, height: 400 } },
  { get: (o, k: string) => (k in o ? (o as Record<string, unknown>)[k] : () => undefined) },
) as never;

const makeEditor = (...els: Element[]): Editor => {
  const host = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    style: { cursor: "" },
  } as never;
  return new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: sceneWith(...els),
  });
};

const frameName = (editor: Editor): string | undefined =>
  (getElement(editor.scene, elementId("f")) as Element & { name?: string }).name;

describe("frame name inline editing", () => {
  it("begin → commit updates the name and clears editing state", () => {
    const editor = makeEditor(frame("f", "Frame 1"));
    editor.beginFrameNameEdit(elementId("f"));
    expect(editor.editingFrameName).toBe(elementId("f"));
    editor.commitFrameNameEdit("Renamed");
    expect(frameName(editor)).toBe("Renamed");
    expect(editor.editingFrameName).toBeNull();
  });

  it("commit trims whitespace", () => {
    const editor = makeEditor(frame("f", "Frame 1"));
    editor.beginFrameNameEdit(elementId("f"));
    editor.commitFrameNameEdit("  Spaced  ");
    expect(frameName(editor)).toBe("Spaced");
  });

  it("commit with empty clears the stored name (renderer falls back to default)", () => {
    const editor = makeEditor(frame("f", "Frame 1"));
    editor.beginFrameNameEdit(elementId("f"));
    editor.commitFrameNameEdit("   ");
    expect(frameName(editor)).toBeUndefined();
  });

  it("commit is undoable as a single step", () => {
    const editor = makeEditor(frame("f", "Frame 1"));
    editor.beginFrameNameEdit(elementId("f"));
    editor.commitFrameNameEdit("Renamed");
    expect(frameName(editor)).toBe("Renamed");
    editor.undo();
    expect(frameName(editor)).toBe("Frame 1");
  });

  it("cancel leaves the name unchanged", () => {
    const editor = makeEditor(frame("f", "Frame 1"));
    editor.beginFrameNameEdit(elementId("f"));
    editor.cancelFrameNameEdit();
    expect(frameName(editor)).toBe("Frame 1");
    expect(editor.editingFrameName).toBeNull();
  });

  it("unchanged name commits without a history entry", () => {
    const editor = makeEditor(frame("f", "Frame 1"));
    editor.beginFrameNameEdit(elementId("f"));
    editor.commitFrameNameEdit("Frame 1");
    expect(editor.canUndo).toBe(false);
  });

  it("ignores non-frame ids", () => {
    const editor = makeEditor(frame("f", "Frame 1"));
    editor.beginFrameNameEdit(elementId("nope"));
    expect(editor.editingFrameName).toBeNull();
  });
});
