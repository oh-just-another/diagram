/**
 * Embedded shape labels: double-click editing seeds an empty label,
 * typing writes into it, commit records one undo step, an emptied label
 * is stripped (the shape stays), cancel restores the origin.
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
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const rect = (id: string, label?: string): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "rectangle",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    width: 120,
    height: 60,
    ...(label !== undefined
      ? { label: { text: label, fontFamily: "system-ui", fontSize: 16 } }
      : {}),
  }) as unknown as Element;

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const noop = () => undefined;
const targetBase: Record<string, unknown> = {
  measureText: (s: string) => ({ width: typeof s === "string" ? s.length * 7 : 0 }),
};
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
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
    style: { cursor: "" },
  }) as never;

const editorWith = (scene: Scene): Editor =>
  new Editor({
    host: makeHost(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

const labelOf = (e: Editor, id: string): { text: string } | undefined =>
  (e.scene.elements.get(elementId(id)) as { label?: { text: string } }).label;

describe("shape label editing", () => {
  it("typing writes into the label; commit records one undoable patch", () => {
    const e = editorWith(sceneWith(rect("r")));
    e.beginTextEdit(elementId("r"));
    expect(labelOf(e, "r")?.text).toBe("");
    e.setEditingText("Hi", 2, 2);
    e.commitTextEdit();
    expect(labelOf(e, "r")?.text).toBe("Hi");
    e.undo();
    expect(labelOf(e, "r")).toBeUndefined();
    e.redo();
    expect(labelOf(e, "r")?.text).toBe("Hi");
  });

  it("committing an emptied label strips it but keeps the shape", () => {
    const e = editorWith(sceneWith(rect("r", "old")));
    e.beginTextEdit(elementId("r"));
    e.setEditingText("", 0, 0);
    e.commitTextEdit();
    expect(e.scene.elements.get(elementId("r"))).toBeDefined();
    expect(labelOf(e, "r")).toBeUndefined();
    e.undo();
    expect(labelOf(e, "r")?.text).toBe("old");
  });

  it("cancel restores the origin label (or removes a seeded one)", () => {
    const e = editorWith(sceneWith(rect("r", "keep")));
    e.beginTextEdit(elementId("r"));
    e.setEditingText("changed", 7, 7);
    e.cancelTextEdit();
    expect(labelOf(e, "r")?.text).toBe("keep");

    const e2 = editorWith(sceneWith(rect("p")));
    e2.beginTextEdit(elementId("p"));
    e2.setEditingText("temp", 4, 4);
    e2.cancelTextEdit();
    expect(labelOf(e2, "p")).toBeUndefined();
  });

  it("caret overlay geometry exists while editing a label", () => {
    const e = editorWith(sceneWith(rect("r", "abc")));
    e.beginTextEdit(elementId("r"));
    const overlay = e.editingTextOverlay();
    expect(overlay).not.toBeNull();
  });
});

describe("label rich-text ranges", () => {
  it("applyTextStyleToRange writes styled runs onto the label", () => {
    const e = editorWith(sceneWith(rect("r", "hello")));
    e.applyTextStyleToRange(elementId("r"), 0, 2, { fontWeight: "bold" });
    const label = (
      e.scene.elements.get(elementId("r")) as unknown as {
        label: { runs?: readonly { text: string; style?: { fontWeight?: string } }[] };
      }
    ).label;
    expect(label.runs?.map((r) => r.text).join("")).toBe("hello");
    expect(label.runs?.[0]).toMatchObject({ text: "he", style: { fontWeight: "bold" } });
  });
});

describe("label edit window (scroll + clipping)", () => {
  // 120×60 shape, fontSize 16 → pad 8, inner 44, lineHeight 19.2 → 2 lines fit.
  it("caret navigation past the window scrolls it (labelScrollLines)", () => {
    const e = editorWith(sceneWith(rect("r")));
    e.beginTextEdit(elementId("r"));
    e.setEditingText("one\ntwo\nthree\nfour", 18, 18); // caret on line 4
    const scroll = (
      e.scene.elements.get(elementId("r")) as unknown as {
        metadata?: { labelScrollLines?: number };
      }
    ).metadata?.labelScrollLines;
    expect(scroll).toBeGreaterThan(0);
    // Jumping back to the start scrolls the window back up.
    e.setEditingSelection(0, 0);
    const back = (
      e.scene.elements.get(elementId("r")) as unknown as {
        metadata?: { labelScrollLines?: number };
      }
    ).metadata?.labelScrollLines;
    expect(back ?? 0).toBe(0);
    // Committing strips the transient hint.
    e.commitTextEdit();
    expect(
      (e.scene.elements.get(elementId("r")) as unknown as { metadata?: object }).metadata,
    ).toBeUndefined();
  });

  it("selection highlight never extends past the visible window", () => {
    const e = editorWith(sceneWith(rect("r")));
    e.beginTextEdit(elementId("r"));
    e.setEditingText("one\ntwo\nthree\nfour", 0, 0);
    e.setEditingSelection(0, 18); // select everything
    const overlay = e.editingTextOverlay();
    expect(overlay).not.toBeNull();
    const shape = e.scene.elements.get(elementId("r"))!;
    const top = shape.position.y;
    const bottom = shape.position.y + 60;
    for (const r of overlay!.selectionRects) {
      expect(r.y).toBeGreaterThanOrEqual(top);
      expect(r.y + r.height).toBeLessThanOrEqual(bottom + 0.01);
    }
  });
});
