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
import { ActionRegistry } from "../src/actions/index.js";
import { actionToggleReadOnly } from "../src/actions/actionView.js";
import { Editor } from "../src/editor.js";

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

const makeEditor = (readOnly = false): Editor =>
  new Editor({
    host: makeHost(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: sceneWith(rect("a"), rect("b")),
    readOnly,
  });

describe("Editor read-only mode", () => {
  it("defaults to editable; setReadOnly / toggleReadOnly flip the flag", () => {
    const editor = makeEditor();
    expect(editor.readOnly).toBe(false);
    editor.setReadOnly(true);
    expect(editor.readOnly).toBe(true);
    editor.toggleReadOnly();
    expect(editor.readOnly).toBe(false);
  });

  it("honours the readOnly constructor option", () => {
    expect(makeEditor(true).readOnly).toBe(true);
  });

  it("setReadOnly notifies subscribers on a real change only", () => {
    const editor = makeEditor();
    const fn = vi.fn();
    editor.subscribe(fn);
    editor.setReadOnly(true);
    expect(fn).toHaveBeenCalledTimes(1);
    editor.setReadOnly(true); // no-op, no extra notify
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("applyEmit drops scene mutations in read-only but keeps selection", () => {
    const editor = makeEditor(true);
    const before = editor.scene.elements.size;

    // Mutation emit — blocked.
    editor.applyEmit({
      type: "CREATE_SHAPE",
      shapeType: "rect",
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    });
    expect(editor.scene.elements.size).toBe(before);

    // Move emit — blocked (position unchanged).
    const a = editor.scene.elements.get(elementId("a"));
    editor.applyEmit({
      type: "MOVE_SHAPE",
      id: elementId("a"),
      delta: { x: 40, y: 40 },
      originalBounds: { x: 0, y: 0, width: 50, height: 50 },
    });
    expect(editor.scene.elements.get(elementId("a"))?.position).toEqual(a?.position);

    // Selection emit — still applied.
    editor.applyEmit({ type: "SELECT_REPLACE", id: elementId("a") });
    expect(editor.selection.has(elementId("a"))).toBe(true);
  });

  it("applyEmit performs the same mutations when editable", () => {
    const editor = makeEditor(false);
    const before = editor.scene.elements.size;
    editor.applyEmit({
      type: "CREATE_SHAPE",
      shapeType: "rect",
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    });
    expect(editor.scene.elements.size).toBe(before + 1);
  });
});

describe("ActionRegistry read-only gating", () => {
  const view = { id: "v", viewMode: true as const, perform: vi.fn() };
  const edit = { id: "e", perform: vi.fn() };

  it("dispatch runs viewMode actions but blocks the rest in read-only", () => {
    const reg = new ActionRegistry();
    const vPerf = vi.fn();
    const ePerf = vi.fn();
    reg.register({ ...view, perform: vPerf });
    reg.register({ ...edit, perform: ePerf });
    const editor = makeEditor(true);
    expect(reg.dispatch("v", { editor })).toBe(true);
    expect(vPerf).toHaveBeenCalledOnce();
    expect(reg.dispatch("e", { editor })).toBe(false);
    expect(ePerf).not.toHaveBeenCalled();
  });

  it("dispatchHotkey blocks non-viewMode actions in read-only", () => {
    const reg = new ActionRegistry();
    const perf = vi.fn();
    reg.register({ id: "make", hotkey: { key: "r" }, perform: perf });
    const editor = makeEditor(true);
    const ev = {
      key: "r",
      code: "KeyR",
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    } as unknown as KeyboardEvent;
    expect(reg.dispatchHotkey(ev, { editor })).toBe(false);
    expect(perf).not.toHaveBeenCalled();
    editor.setReadOnly(false);
    expect(reg.dispatchHotkey(ev, { editor })).toBe(true);
    expect(perf).toHaveBeenCalledOnce();
  });
});

describe("actionToggleReadOnly", () => {
  it("toggles read-only and stays available while read-only", () => {
    const editor = makeEditor();
    const reg = new ActionRegistry();
    reg.register(actionToggleReadOnly);
    expect(reg.dispatch("toggle-read-only", { editor })).toBe(true);
    expect(editor.readOnly).toBe(true);
    // Still dispatchable in read-only (viewMode: true) — flips back off.
    expect(reg.dispatch("toggle-read-only", { editor })).toBe(true);
    expect(editor.readOnly).toBe(false);
  });
});
