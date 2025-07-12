import { describe, expect, it, vi } from "vitest";
import { shapeId } from "@oh-just-another/types";
import {
  addShape,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Shape,
} from "@oh-just-another/scene";
import { ActionRegistry, defaultActionRegistry } from "../src/actions/index.js";
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

const makeEditor = (): Editor => {
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
    rect: () => {},
    ellipse: () => {},
    fill: () => {},
    stroke: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }),
    drawImage: () => {},
  } as never;
  const host = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: { cursor: "" },
  } as never;
  return new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: sceneWith(rect("a"), rect("b")),
  });
};

describe("ActionRegistry", () => {
  it("register + get + getAll preserve insertion order", () => {
    const reg = new ActionRegistry();
    const a = { id: "x", perform: vi.fn() };
    const b = { id: "y", perform: vi.fn() };
    reg.register(a);
    reg.register(b);
    expect(reg.get("x")).toBe(a);
    expect(reg.getAll().map((act) => act.id)).toEqual(["x", "y"]);
  });

  it("register throws on duplicate id; replace updates in place", () => {
    const reg = new ActionRegistry();
    reg.register({ id: "x", perform: () => {} });
    expect(() => reg.register({ id: "x", perform: () => {} })).toThrow();
    const next = { id: "x", perform: vi.fn() };
    reg.replace(next);
    expect(reg.get("x")).toBe(next);
  });

  it("dispatch honours predicate and returns boolean", () => {
    const reg = new ActionRegistry();
    const perf = vi.fn();
    reg.register({
      id: "x",
      predicate: () => false,
      perform: perf,
    });
    const editor = makeEditor();
    expect(reg.dispatch("x", { editor })).toBe(false);
    expect(perf).not.toHaveBeenCalled();
  });

  it("dispatchHotkey matches and triggers", () => {
    const reg = new ActionRegistry();
    const perf = vi.fn();
    reg.register({
      id: "select-all",
      hotkey: { key: "a", meta: true },
      perform: perf,
    });
    const editor = makeEditor();
    // The node test env has no KeyboardEvent; the matcher only reads
    // .key / .code / .metaKey / .ctrlKey / .shiftKey / .altKey, so a
    // plain object cast is enough to exercise dispatchHotkey.
    const ev = {
      key: "a",
      code: "KeyA",
      ctrlKey: true,
      metaKey: true,
      shiftKey: false,
      altKey: false,
    } as unknown as KeyboardEvent;
    expect(reg.dispatchHotkey(ev, { editor })).toBe(true);
    expect(perf).toHaveBeenCalledOnce();
  });

  it("dispatchHotkey matches by physical code on non-Latin layouts", () => {
    // Russian layout: physical Z (key: ']' / Cmd+]) yields key U+044A,
    // but event.code === 'BracketRight' is layout-independent.
    // Same problem with letters: Cmd+Z on Russian layout has
    // key U+044F but code='KeyZ'.
    const reg = new ActionRegistry();
    const undo = vi.fn();
    const front = vi.fn();
    reg.register({ id: "undo", hotkey: { key: "z", meta: true }, perform: undo });
    reg.register({
      id: "to-front",
      hotkey: { key: "]", meta: true, shift: true },
      perform: front,
    });
    const editor = makeEditor();
    const cyrillicZ = {
      key: "\u044f",
      code: "KeyZ",
      ctrlKey: true,
      metaKey: true,
      shiftKey: false,
      altKey: false,
    } as unknown as KeyboardEvent;
    expect(reg.dispatchHotkey(cyrillicZ, { editor })).toBe(true);
    expect(undo).toHaveBeenCalledOnce();

    const cyrillicBracket = {
      key: "\u044a",
      code: "BracketRight",
      ctrlKey: true,
      metaKey: true,
      shiftKey: true,
      altKey: false,
    } as unknown as KeyboardEvent;
    expect(reg.dispatchHotkey(cyrillicBracket, { editor })).toBe(true);
    expect(front).toHaveBeenCalledOnce();
  });
});

describe("defaultActionRegistry built-ins", () => {
  it("undo / redo wired", () => {
    const editor = makeEditor();
    const undoSpy = vi.spyOn(editor, "undo");
    defaultActionRegistry.dispatch("undo", { editor });
    expect(undoSpy).toHaveBeenCalled();
  });

  it("group-selection predicate requires multi-selection", () => {
    const editor = makeEditor();
    // No selection → predicate false.
    expect(defaultActionRegistry.dispatch("group-selection", { editor })).toBe(false);
    // Two-shape selection → predicate true.
    editor.selectAll();
    expect(editor.selection.size).toBeGreaterThanOrEqual(2);
    expect(defaultActionRegistry.dispatch("group-selection", { editor })).toBe(true);
  });

  it("mode-* actions switch editor mode", () => {
    const editor = makeEditor();
    defaultActionRegistry.dispatch("mode-hand", { editor });
    expect(editor.mode).toBe("hand");
    defaultActionRegistry.dispatch("mode-select", { editor });
    expect(editor.mode).toBe("select");
  });
});
