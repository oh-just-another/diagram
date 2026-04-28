import { describe, expect, it, vi } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  addElement,
  addLink,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Link,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { ActionRegistry, defaultActionRegistry } from "../src/actions/index.js";
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

// A render target whose every method is a no-op; `measureText` returns a zero
// box. Proxy avoids spelling out ~25 empty methods (and the no-empty-function
// lint they'd trip). `() => undefined` is intentionally non-empty.
const noop = () => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;

// A canvas host stub. Returns the registered keydown/pointer handlers so a test
// can drive interaction (`handlers.get("pointerdown")!(...)`).
const makeHost = (w = 100, h = 100) => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (ty: string, fn: (ev: unknown) => void) => handlers.set(ty, fn),
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    style: { cursor: "" },
  } as never;
  return { host, handlers };
};

const makeEditor = (): Editor =>
  new Editor({
    host: makeHost().host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: sceneWith(rect("a"), rect("b")),
  });

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
    reg.register({ id: "x", perform: noop });
    expect(() => reg.register({ id: "x", perform: noop })).toThrow();
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
    // Russian layout: physical Z (Cmd+Z) yields key U+044F, physical
    // ']' yields key U+044A. event.code is layout-invariant.
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

  it("dispatchHotkey does NOT hijack swapped-position Latin layouts", () => {
    // Czech layout swaps physical Y / Z. Pressing physical Y
    // produces key='y' but code='KeyZ'. The Z-hotkey must NOT
    // fire — the user pressed Y, and `event.key === 'y'` is the
    // ground truth on Latin layouts. Same idea for French AZERTY
    // (Q/A swap), Dvorak, etc.
    const reg = new ActionRegistry();
    const undo = vi.fn();
    reg.register({ id: "undo", hotkey: { key: "z", meta: true }, perform: undo });
    const editor = makeEditor();
    const czechY = {
      key: "y",
      code: "KeyZ",
      ctrlKey: true,
      metaKey: true,
      shiftKey: false,
      altKey: false,
    } as unknown as KeyboardEvent;
    expect(reg.dispatchHotkey(czechY, { editor })).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });

  it("dispatchHotkey matches code on CJK / Arabic / Hebrew", () => {
    // Layouts whose `event.key` is never a Latin char: physical Z
    // → some non-Latin glyph; layout-invariant fallback fires.
    const reg = new ActionRegistry();
    const undo = vi.fn();
    reg.register({ id: "undo", hotkey: { key: "z", meta: true }, perform: undo });
    const editor = makeEditor();
    const cases = [
      { key: "重", code: "KeyZ" }, // Cangjie (Traditional Chinese)
      { key: "つ", code: "KeyZ" }, // Japanese
      { key: "ㅋ", code: "KeyZ" }, // 2-Set Korean
      { key: "ז", code: "KeyZ" }, // Hebrew
      { key: "ζ", code: "KeyZ" }, // Greek
    ];
    for (const { key, code } of cases) {
      undo.mockClear();
      const ev = {
        key,
        code,
        ctrlKey: true,
        metaKey: true,
        shiftKey: false,
        altKey: false,
      } as unknown as KeyboardEvent;
      expect(reg.dispatchHotkey(ev, { editor })).toBe(true);
      expect(undo).toHaveBeenCalledOnce();
    }
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

  // A LINK lives in a separate single-selection slot (editor.selectedLink),
  // not the element Selection set. Delete/Backspace must still fire when only
  // a link is selected — its predicate considers both.
  it("delete-selection fires for a link-only selection (Backspace on a link)", () => {
    const { host, handlers } = makeHost(800, 600);
    let s = emptyScene();
    s = addElement(s, { ...rect("a"), position: { x: 0, y: 80 } }).scene; // right ≈ (50,105)
    s = addElement(s, { ...rect("b"), position: { x: 200, y: 80 } }).scene; // left ≈ (200,105)
    const link: Link = {
      id: linkId("L"),
      layerId: DEFAULT_LAYER_ID,
      order: orderBetween(null, null),
      from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
      style: { stroke: "#000" },
      routing: "orthogonal",
    };
    s = addLink(s, link).scene;
    const editor = new Editor({
      host,
      mainTarget: noopTarget,
      overlayTarget: noopTarget,
      initialScene: s,
    });
    editor.setViewportSize(800, 600);

    // Click the link mid-span to select it (no element selected).
    const pe = (type: string, x: number, y: number) => ({
      type,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      timeStamp: 0,
      preventDefault: noop,
    });
    handlers.get("pointerdown")!(pe("pointerdown", 125, 105));
    handlers.get("pointerup")!(pe("pointerup", 125, 105));
    expect(editor.selectedLink).not.toBeNull();
    expect(editor.selection.size).toBe(0);

    const ev = {
      key: "Backspace",
      code: "Backspace",
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    } as unknown as KeyboardEvent;
    expect(defaultActionRegistry.dispatchHotkey(ev, { editor })).toBe(true);
    expect(editor.scene.links.has(linkId("L"))).toBe(false);
    expect(editor.selectedLink).toBeNull();
  });

  const keyEv = (key: string, t: number, mods: Partial<KeyboardEvent> = {}): KeyboardEvent =>
    ({
      key,
      code: `Key${key.toUpperCase()}`,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      timeStamp: t,
      ...mods,
    }) as unknown as KeyboardEvent;

  it("sequence hotkey (g d) fires only after the full chain in order", () => {
    const reg = new ActionRegistry();
    const perf = vi.fn();
    reg.register({ id: "toggle-debug", sequence: ["g", "d"], perform: perf });
    const editor = makeEditor();
    // `g` alone — no fire.
    expect(reg.dispatchHotkey(keyEv("g", 0), { editor })).toBe(false);
    expect(perf).not.toHaveBeenCalled();
    // then `d` — completes the sequence.
    expect(reg.dispatchHotkey(keyEv("d", 100), { editor })).toBe(true);
    expect(perf).toHaveBeenCalledOnce();
  });

  it("sequence does NOT fire when the keys fall outside the time window", () => {
    const reg = new ActionRegistry();
    const perf = vi.fn();
    reg.register({ id: "toggle-debug", sequence: ["g", "d"], perform: perf });
    const editor = makeEditor();
    reg.dispatchHotkey(keyEv("g", 0), { editor });
    // `d` long after `g` (> SEQUENCE_HOTKEY_WINDOW_MS) — buffer pruned.
    expect(reg.dispatchHotkey(keyEv("d", 5000), { editor })).toBe(false);
    expect(perf).not.toHaveBeenCalled();
  });

  it("a modifier press between sequence keys breaks the chain", () => {
    const reg = new ActionRegistry();
    const perf = vi.fn();
    reg.register({ id: "toggle-debug", sequence: ["g", "d"], perform: perf });
    const editor = makeEditor();
    reg.dispatchHotkey(keyEv("g", 0), { editor });
    reg.dispatchHotkey(keyEv("a", 50, { metaKey: true, ctrlKey: true }), { editor }); // Cmd+A
    expect(reg.dispatchHotkey(keyEv("d", 100), { editor })).toBe(false);
    expect(perf).not.toHaveBeenCalled();
  });

  it("keyTest escape hatch claims the event", () => {
    const reg = new ActionRegistry();
    const perf = vi.fn();
    reg.register({
      id: "custom",
      keyTest: (ev) => ev.key === "Enter" && ev.shiftKey,
      perform: perf,
    });
    const editor = makeEditor();
    expect(reg.dispatchHotkey(keyEv("Enter", 0, { shiftKey: true }), { editor })).toBe(true);
    expect(perf).toHaveBeenCalledOnce();
    expect(reg.dispatchHotkey(keyEv("Enter", 1), { editor })).toBe(false); // no shift
  });

  it("keyTest still honours predicate", () => {
    const reg = new ActionRegistry();
    const perf = vi.fn();
    reg.register({
      id: "custom",
      keyTest: () => true,
      predicate: () => false,
      perform: perf,
    });
    const editor = makeEditor();
    expect(reg.dispatchHotkey(keyEv("x", 0), { editor })).toBe(false);
    expect(perf).not.toHaveBeenCalled();
  });

  it("checked reflects toggle state and is a pure read", () => {
    const reg = new ActionRegistry();
    let on = false;
    reg.register({
      id: "toggle-thing",
      uiKind: "toggle",
      checked: () => on,
      perform: () => { on = !on; },
    });
    const editor = makeEditor();
    const a = reg.get("toggle-thing")!;
    expect(a.checked?.({ editor })).toBe(false);
    reg.dispatch("toggle-thing", { editor });
    expect(a.checked?.({ editor })).toBe(true);
  });

  it("arrow keys nudge the selection (Shift = coarse step) via the registry", () => {
    const editor = makeEditor();
    editor.applyEmit({ type: "SELECT_REPLACE", id: elementId("a") });
    const x0 = editor.scene.elements.get(elementId("a"))!.position.x;
    expect(defaultActionRegistry.dispatchHotkey(keyEv("ArrowRight", 0), { editor })).toBe(true);
    expect(editor.scene.elements.get(elementId("a"))!.position.x).toBe(x0 + 1);
    expect(
      defaultActionRegistry.dispatchHotkey(keyEv("ArrowRight", 1, { shiftKey: true }), { editor }),
    ).toBe(true);
    expect(editor.scene.elements.get(elementId("a"))!.position.x).toBe(x0 + 11);
  });

  it("Tab is a registered focus-cycle action", () => {
    const editor = makeEditor();
    expect(defaultActionRegistry.dispatchHotkey(keyEv("Tab", 0), { editor })).toBe(true);
  });

  it("Enter only fires edit-or-create when applicable (predicate gate)", () => {
    const editor = makeEditor();
    // Nothing selected, select mode → Enter does nothing (falls through).
    expect(defaultActionRegistry.dispatchHotkey(keyEv("Enter", 0), { editor })).toBe(false);
  });
});
