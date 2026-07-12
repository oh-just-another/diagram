import { describe, expect, it, vi } from "vitest";
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

// Gesture-level coverage for pointer-binding branches the focused gesture
// suites don't reach: the pan triggers (right / middle button, Space+left,
// hand mode) and their no-drag context-menu fallback, ⌥-drag duplicate,
// Cmd-click link-open, marquee lasso select, and tap-to-toggle GIF playback.
// Doubles as a safety net before the planned pointer-binding decomposition.

const noop = () => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;

const rect = (id: string, x: number, y: number, extra: Partial<Element> = {}): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "rectangle",
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: { fill: "#000" },
    width: 50,
    height: 50,
    ...extra,
  }) as Element;

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const makeHost = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (t: string, fn: (ev: unknown) => void) => handlers.set(t, fn),
    removeEventListener: (t: string) => handlers.delete(t),
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    style: { cursor: "" },
  } as never;
  return { host, handlers };
};

interface PtrOpts {
  button?: number;
  pointerType?: string;
  alt?: boolean;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
}

const ptr = (type: string, x: number, y: number, o: PtrOpts = {}) => ({
  type,
  clientX: x,
  clientY: y,
  pointerId: 1,
  pointerType: o.pointerType ?? "mouse",
  button: o.button ?? 0,
  buttons: type === "pointerup" ? 0 : 1,
  shiftKey: o.shift ?? false,
  ctrlKey: o.ctrl ?? false,
  altKey: o.alt ?? false,
  metaKey: o.meta ?? false,
  pressure: 0.5,
  timeStamp: 0,
  preventDefault: noop,
  target: null,
});

const setup = (scene: Scene = sceneWith(rect("a", 0, 0))) => {
  const { host, handlers } = makeHost();
  const editor = new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });
  editor.setViewportSize(400, 400);
  const fire = (t: string, x: number, y: number, o: PtrOpts = {}) =>
    handlers.get(t)!(ptr(t, x, y, o));
  return { editor, fire, handlers };
};

describe("pan triggers", () => {
  it("right-button drag pans the viewport and arms context-menu suppression", () => {
    const { editor, fire } = setup();
    const pan0 = { ...editor.scene.viewport.pan };
    fire("pointerdown", 100, 100, { button: 2 });
    expect(
      (editor as unknown as { suppressNextContextMenu: boolean }).suppressNextContextMenu,
    ).toBe(true);
    fire("pointermove", 160, 140, { button: 2 });
    fire("pointerup", 160, 140, { button: 2 });
    expect(editor.scene.viewport.pan).not.toEqual(pan0);
    expect(editor.selection.size).toBe(0);
    editor.dispose();
  });

  it("middle-button drag pans the viewport", () => {
    const { editor, fire } = setup();
    const pan0 = { ...editor.scene.viewport.pan };
    fire("pointerdown", 100, 100, { button: 1 });
    fire("pointermove", 40, 30, { button: 1 });
    fire("pointerup", 40, 30, { button: 1 });
    expect(editor.scene.viewport.pan).not.toEqual(pan0);
    editor.dispose();
  });

  it("Space + left drag pans the viewport", () => {
    const { editor, fire } = setup();
    (editor as unknown as { spaceHeld: boolean }).spaceHeld = true;
    const pan0 = { ...editor.scene.viewport.pan };
    fire("pointerdown", 120, 120, { button: 0 });
    fire("pointermove", 180, 160, { button: 0 });
    fire("pointerup", 180, 160, { button: 0 });
    expect(editor.scene.viewport.pan).not.toEqual(pan0);
    editor.dispose();
  });

  it("hand mode left drag pans the viewport", () => {
    const { editor, fire } = setup();
    editor.setActiveTool("hand");
    const pan0 = { ...editor.scene.viewport.pan };
    fire("pointerdown", 120, 120, { button: 0 });
    fire("pointermove", 60, 90, { button: 0 });
    fire("pointerup", 60, 90, { button: 0 });
    expect(editor.scene.viewport.pan).not.toEqual(pan0);
    editor.dispose();
  });

  it("a right-click without a drag fires the long-press (context-menu) listeners", () => {
    const { editor, fire } = setup();
    const seen: Array<{ worldPoint: { x: number; y: number } }> = [];
    editor.onLongPress((payload) => seen.push(payload));
    const pan0 = { ...editor.scene.viewport.pan };
    fire("pointerdown", 100, 100, { button: 2 });
    fire("pointerup", 100, 100, { button: 2 });
    // No drag → viewport unchanged, menu callback fired at the click point.
    expect(editor.scene.viewport.pan).toEqual(pan0);
    expect(seen).toHaveLength(1);
    editor.dispose();
  });
});

describe("⌥-drag duplicate", () => {
  it("alt-pressing a selected shape clones it and drags the clone, leaving the original", () => {
    const { editor, fire } = setup(sceneWith(rect("a", 100, 100)));
    editor.applyEmit({ type: "SELECT_REPLACE", id: elementId("a") });
    const countBefore = editor.scene.elements.size;
    const originalPos = { ...editor.scene.elements.get(elementId("a"))!.position };
    // Alt-press on the shape body, then drag well past the slop threshold.
    fire("pointerdown", 120, 120, { button: 0, alt: true });
    fire("pointermove", 200, 200, { button: 0, alt: true });
    fire("pointerup", 200, 200, { button: 0, alt: true });
    // A clone was added, and the original stayed put.
    expect(editor.scene.elements.size).toBe(countBefore + 1);
    expect(editor.scene.elements.get(elementId("a"))!.position).toEqual(originalPos);
    editor.dispose();
  });
});

describe("Cmd-click link open", () => {
  it("a Cmd-tap on a linked shape opens its href without changing the selection", () => {
    const { editor, fire } = setup(sceneWith(rect("a", 0, 0, { href: "https://example.com" })));
    const openSpy = vi.spyOn(editor, "openLink");
    expect(editor.selection.size).toBe(0);
    fire("pointerdown", 25, 25, { button: 0, meta: true });
    fire("pointerup", 25, 25, { button: 0, meta: true });
    expect(openSpy).toHaveBeenCalledWith("https://example.com");
    // Link-open is not a selection gesture — selection stays empty.
    expect(editor.selection.size).toBe(0);
    openSpy.mockRestore();
    editor.dispose();
  });
});

describe("marquee lasso select", () => {
  it("a mouse drag over empty canvas rubber-bands the enclosed shape into the selection", () => {
    const { editor, fire } = setup(sceneWith(rect("a", 0, 0)));
    // Start on empty space beyond the rect, drag back across it.
    fire("pointerdown", 120, 120, { button: 0 });
    fire("pointermove", 60, 60, { button: 0 });
    fire("pointermove", -20, -20, { button: 0 });
    fire("pointerup", -20, -20, { button: 0 });
    expect(editor.selection.has(elementId("a"))).toBe(true);
    editor.dispose();
  });
});

describe("tap toggles GIF playback", () => {
  it("a stationary tap on an animated image toggles its playback", () => {
    const { editor, fire } = setup(emptyScene());
    const id = editor.insertImage({
      src: "data:,",
      width: 50,
      height: 50,
      position: { x: 0, y: 0 },
      animated: true,
      animationKind: "gif",
    });
    const toggleSpy = vi.spyOn(editor, "togglePlayback");
    fire("pointerdown", 25, 25, { button: 0 });
    fire("pointerup", 25, 25, { button: 0 });
    expect(toggleSpy).toHaveBeenCalledWith(id);
    toggleSpy.mockRestore();
    editor.dispose();
  });

  it("a drag on an animated image does NOT toggle playback", () => {
    const { editor, fire } = setup(emptyScene());
    editor.insertImage({
      src: "data:,",
      width: 50,
      height: 50,
      position: { x: 0, y: 0 },
      animated: true,
      animationKind: "gif",
    });
    const toggleSpy = vi.spyOn(editor, "togglePlayback");
    fire("pointerdown", 25, 25, { button: 0 });
    fire("pointermove", 120, 120, { button: 0 });
    fire("pointerup", 120, 120, { button: 0 });
    expect(toggleSpy).not.toHaveBeenCalled();
    toggleSpy.mockRestore();
    editor.dispose();
  });
});
