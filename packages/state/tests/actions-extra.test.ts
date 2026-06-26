import { describe, expect, it, vi } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { modeActions } from "../src/actions/actionMode.js";
import { selectionActions } from "../src/actions/actionSelection.js";
import { zOrderActions } from "../src/actions/actionZOrder.js";

// Distinct `order` keys so z-order comparisons are meaningful: `a` sits below
// `b`. `orderBetween(prev, null)` strictly increases.
const ORDER_A = orderBetween(null, null);
const ORDER_B = orderBetween(ORDER_A, null);

const rect = (id: string, order = orderBetween(null, null)): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order,
  style: {},
  width: 50,
  height: 50,
});

const sceneWith = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of elements) s = addElement(s, sh).scene;
  return s;
};

const noop = () => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;

const makeHost = (w = 100, h = 100) => {
  const host = {
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    style: { cursor: "" },
  } as never;
  return host;
};

const makeEditor = (scene?: Scene): Editor =>
  new Editor({
    host: makeHost(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene ?? sceneWith(rect("a", ORDER_A), rect("b", ORDER_B)),
  });

const byId = (actions: readonly { id: string }[], id: string) => {
  const a = actions.find((x) => x.id === id);
  if (!a) throw new Error(`action not found: ${id}`);
  return a as (typeof actions)[number] & {
    perform: (ctx: { editor: Editor }) => void;
    checked?: (ctx: { editor: Editor }) => boolean;
    predicate?: (ctx: { editor: Editor }) => boolean;
  };
};

describe("modeActions", () => {
  const cases: ReadonlyArray<[string, Editor["mode"]]> = [
    ["mode-select", "select"],
    ["mode-hand", "hand"],
    ["mode-rect", "draw-rect"],
    ["mode-ellipse", "draw-ellipse"],
    ["mode-text", "draw-text"],
    ["mode-edge", "draw-edge"],
    ["mode-brush", "brush"],
    ["mode-frame", "draw-frame"],
  ];

  it.each(cases)("%s switches the editor mode and reflects checked()", (id, mode) => {
    const editor = makeEditor();
    const action = byId(modeActions, id);
    // Before performing, checked() is false (editor starts in select mode for
    // the non-select cases; for mode-select itself the default is select).
    if (id !== "mode-select") expect(action.checked?.({ editor })).toBe(false);
    action.perform({ editor });
    expect(editor.mode).toBe(mode);
    expect(action.checked?.({ editor })).toBe(true);
    // Switching to a different mode flips checked() back off.
    byId(modeActions, "mode-hand").perform({ editor });
    if (id !== "mode-hand") expect(action.checked?.({ editor })).toBe(false);
  });

  it("toggle-tool-lock flips editor.toolLocked and reflects checked()", () => {
    const editor = makeEditor();
    const action = byId(modeActions, "toggle-tool-lock");
    expect(editor.toolLocked).toBe(false);
    expect(action.checked?.({ editor })).toBe(false);
    action.perform({ editor });
    expect(editor.toolLocked).toBe(true);
    expect(action.checked?.({ editor })).toBe(true);
    action.perform({ editor });
    expect(editor.toolLocked).toBe(false);
  });

  it("cancel clears the selection via cancelInteraction", () => {
    const editor = makeEditor();
    editor.selectAll();
    expect(editor.selection.size).toBeGreaterThan(0);
    const spy = vi.spyOn(editor, "cancelInteraction");
    byId(modeActions, "cancel").perform({ editor });
    expect(spy).toHaveBeenCalledOnce();
    expect(editor.selection.size).toBe(0);
  });
});

describe("selectionActions", () => {
  it("select-all selects every element", () => {
    const editor = makeEditor();
    byId(selectionActions, "select-all").perform({ editor });
    expect(editor.selection.size).toBe(2);
  });

  it("delete-selection removes the selected element; predicate gates on selection", () => {
    const editor = makeEditor();
    const action = byId(selectionActions, "delete-selection");
    expect(action.predicate?.({ editor })).toBe(false); // nothing selected
    editor.setSelection([elementId("a")]);
    expect(action.predicate?.({ editor })).toBe(true);
    action.perform({ editor });
    expect(editor.scene.elements.has(elementId("a"))).toBe(false);
    expect(editor.scene.elements.has(elementId("b"))).toBe(true);
  });

  it("duplicate-selection clones the selection; predicate requires a selection", () => {
    const editor = makeEditor();
    const action = byId(selectionActions, "duplicate-selection");
    expect(action.predicate?.({ editor })).toBe(false);
    editor.setSelection([elementId("a")]);
    expect(action.predicate?.({ editor })).toBe(true);
    const before = editor.scene.elements.size;
    action.perform({ editor });
    expect(editor.scene.elements.size).toBe(before + 1);
  });

  it("toggle-lock locks the selected element; predicate requires a selection", () => {
    const editor = makeEditor();
    const action = byId(selectionActions, "toggle-lock");
    expect(action.predicate?.({ editor })).toBe(false);
    editor.setSelection([elementId("a")]);
    expect(action.predicate?.({ editor })).toBe(true);
    action.perform({ editor });
    expect(editor.scene.elements.get(elementId("a"))?.locked).toBe(true);
    action.perform({ editor });
    expect(editor.scene.elements.get(elementId("a"))?.locked).toBeUndefined();
  });

  it("enter-container predicate requires exactly one selected; perform delegates", () => {
    const frame = { ...rect("f"), type: "frame", width: 300, height: 200 } as unknown as Element;
    const m1 = { ...rect("m1"), frameId: elementId("f") } as unknown as Element;
    const editor = makeEditor(sceneWith(frame, m1));
    const action = byId(selectionActions, "enter-container");
    // Nothing selected → predicate false.
    expect(action.predicate?.({ editor })).toBe(false);
    editor.setSelection([elementId("f")]);
    expect(action.predicate?.({ editor })).toBe(true);
    const spy = vi.spyOn(editor, "enterContainer");
    action.perform({ editor });
    expect(spy).toHaveBeenCalledOnce();
    expect([...editor.selection]).toEqual([elementId("m1")]);
  });

  it("exit-container predicate requires a selection; perform delegates", () => {
    const frame = { ...rect("f"), type: "frame", width: 300, height: 200 } as unknown as Element;
    const m1 = { ...rect("m1"), frameId: elementId("f") } as unknown as Element;
    const editor = makeEditor(sceneWith(frame, m1));
    const action = byId(selectionActions, "exit-container");
    expect(action.predicate?.({ editor })).toBe(false);
    editor.setSelection([elementId("m1")]);
    expect(action.predicate?.({ editor })).toBe(true);
    const spy = vi.spyOn(editor, "exitContainer");
    action.perform({ editor });
    expect(spy).toHaveBeenCalledOnce();
    expect([...editor.selection]).toEqual([elementId("f")]);
  });
});

describe("zOrderActions", () => {
  const orderOf = (editor: Editor, id: string) => editor.scene.elements.get(elementId(id))!.order;

  it("every z-order action is gated by a selection", () => {
    const editor = makeEditor();
    for (const action of zOrderActions) {
      expect(byId(zOrderActions, action.id).predicate?.({ editor })).toBe(false);
    }
    editor.setSelection([elementId("a")]);
    for (const action of zOrderActions) {
      expect(byId(zOrderActions, action.id).predicate?.({ editor })).toBe(true);
    }
  });

  it("bring-to-front raises `a` above `b`", () => {
    const editor = makeEditor();
    expect(orderOf(editor, "a") < orderOf(editor, "b")).toBe(true);
    editor.setSelection([elementId("a")]);
    byId(zOrderActions, "bring-to-front").perform({ editor });
    expect(orderOf(editor, "a") > orderOf(editor, "b")).toBe(true);
  });

  it("send-to-back drops `b` below `a`", () => {
    const editor = makeEditor();
    expect(orderOf(editor, "b") > orderOf(editor, "a")).toBe(true);
    editor.setSelection([elementId("b")]);
    byId(zOrderActions, "send-to-back").perform({ editor });
    expect(orderOf(editor, "b") < orderOf(editor, "a")).toBe(true);
  });

  it("bring-forward moves `a` up one step (above `b`)", () => {
    const editor = makeEditor();
    editor.setSelection([elementId("a")]);
    byId(zOrderActions, "bring-forward").perform({ editor });
    expect(orderOf(editor, "a") > orderOf(editor, "b")).toBe(true);
  });

  it("send-backward moves `b` down one step (below `a`)", () => {
    const editor = makeEditor();
    editor.setSelection([elementId("b")]);
    byId(zOrderActions, "send-backward").perform({ editor });
    expect(orderOf(editor, "b") < orderOf(editor, "a")).toBe(true);
  });
});

describe("copy / paste style", () => {
  const styled = (id: string, style: Element["style"]): Element => ({ ...rect(id), style });

  it("copies the first selection's style and applies it on paste", () => {
    const editor = makeEditor(
      sceneWith(styled("a", { fill: "#f00", strokeWidth: 3 }), styled("b", { fill: "#00f" })),
    );
    editor.setSelection([elementId("a")]);
    editor.copySelectionStyle();
    editor.setSelection([elementId("b")]);
    editor.pasteSelectionStyle();
    const b = editor.scene.elements.get(elementId("b"));
    expect(b?.style.fill).toBe("#f00");
    expect(b?.style.strokeWidth).toBe(3);
  });

  it("paste is inert before any copy", () => {
    const editor = makeEditor();
    expect(editor.hasStyleClipboard).toBe(false);
    editor.setSelection([elementId("a")]);
    expect(() => {
      editor.pasteSelectionStyle();
    }).not.toThrow();
  });
});
