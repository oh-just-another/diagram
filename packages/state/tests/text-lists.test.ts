/**
 * Text-list editing APIs: whole-element and selection-scoped list
 * toggling, indent clamping, live paragraph remapping while typing
 * (Enter continues the list) and undo granularity.
 */
import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
  type TextElement,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { MAX_LIST_INDENT } from "../src/constants.js";

const textEl = (id: string, text: string): Element =>
  ({
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
  }) as unknown as Element;

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const noop = () => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;
const makeHost = () =>
  ({
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: { cursor: "" },
  }) as never;

const editorWith = (scene: Scene): Editor =>
  new Editor({
    host: makeHost(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

const paragraphsOf = (e: Editor, id: string): readonly { list?: string; indent?: number }[] =>
  (e.scene.elements.get(elementId(id)) as TextElement).paragraphs ?? [];

describe("setParagraphList", () => {
  it("applies the kind to every paragraph outside editing and clears with null", () => {
    const e = editorWith(sceneWith(textEl("t", "a\nb")));
    e.setParagraphList([elementId("t")], "bullet");
    expect(paragraphsOf(e, "t")).toEqual([{ list: "bullet" }, { list: "bullet" }]);
    e.setParagraphList([elementId("t")], null);
    expect((e.scene.elements.get(elementId("t")) as TextElement).paragraphs).toBeUndefined();
  });

  it("targets only the selection's paragraphs during inline editing", () => {
    const e = editorWith(sceneWith(textEl("t", "aa\nbb\ncc")));
    e.beginTextEdit(elementId("t"));
    e.setEditingSelection(4, 4); // caret inside "bb"
    e.setParagraphList([elementId("t")], "numbered");
    e.commitTextEdit();
    expect(paragraphsOf(e, "t")).toEqual([{}, { list: "numbered" }]);
  });

  it("is a single undo step", () => {
    const e = editorWith(sceneWith(textEl("t", "a\nb")));
    e.setParagraphList([elementId("t")], "bullet");
    e.undo();
    expect((e.scene.elements.get(elementId("t")) as TextElement).paragraphs).toBeUndefined();
  });
});

describe("indentParagraphs", () => {
  it("shifts nesting and clamps to [0, MAX_LIST_INDENT]", () => {
    const e = editorWith(sceneWith(textEl("t", "a")));
    e.setParagraphList([elementId("t")], "bullet");
    e.indentParagraphs([elementId("t")], 1);
    expect(paragraphsOf(e, "t")).toEqual([{ list: "bullet", indent: 1 }]);
    e.indentParagraphs([elementId("t")], -1);
    e.indentParagraphs([elementId("t")], -1); // already at 0 — stays
    expect(paragraphsOf(e, "t")).toEqual([{ list: "bullet" }]);
    for (let i = 0; i < MAX_LIST_INDENT + 3; i++) e.indentParagraphs([elementId("t")], 1);
    expect(paragraphsOf(e, "t")[0]?.indent).toBe(MAX_LIST_INDENT);
  });
});

describe("paragraph remap while typing", () => {
  it("Enter inside a list item continues the list live", () => {
    const e = editorWith(sceneWith(textEl("t", "item")));
    e.setParagraphList([elementId("t")], "bullet");
    e.beginTextEdit(elementId("t"));
    // Simulate the textarea inserting a newline at the end.
    e.setEditingText("item\n", 5, 5);
    e.setEditingText("item\nnext", 9, 9);
    e.commitTextEdit();
    expect(paragraphsOf(e, "t")).toEqual([{ list: "bullet" }, { list: "bullet" }]);
  });

  it("deleting the list line drops its attrs", () => {
    const e = editorWith(sceneWith(textEl("t", "a\nb")));
    e.beginTextEdit(elementId("t"));
    e.setEditingSelection(0, 0);
    e.setParagraphList([elementId("t")], "bullet"); // only paragraph 0
    e.setEditingText("b", 0, 0); // first line removed
    e.commitTextEdit();
    expect((e.scene.elements.get(elementId("t")) as TextElement).paragraphs).toBeUndefined();
  });
});
