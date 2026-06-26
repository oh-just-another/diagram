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

// Covers the wheel router (zoom vs pan classification) plus the contextmenu
// suppression and pointercancel handlers in pointer-binding — none of which the
// pointer-gesture tests reach (they drive pointerdown/move/up only).

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

const makeEditor = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (t: string, fn: (ev: unknown) => void) => handlers.set(t, fn),
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: { cursor: "" },
  } as never;
  const editor = new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: sceneWith(rect("a")),
  });
  return { editor, handlers };
};

const wheel = (o: Record<string, unknown>) => ({
  preventDefault: noop,
  clientX: 50,
  clientY: 50,
  deltaX: 0,
  deltaY: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...o,
});

describe("wheel routing", () => {
  it("ctrl+wheel zooms", () => {
    const { editor, handlers } = makeEditor();
    const z0 = editor.scene.viewport.zoom;
    handlers.get("wheel")!(wheel({ ctrlKey: true, deltaY: -100 }));
    expect(editor.scene.viewport.zoom).not.toBe(z0);
  });

  it("horizontal wheel pans both axes", () => {
    const { editor, handlers } = makeEditor();
    const p0 = editor.scene.viewport.pan;
    handlers.get("wheel")!(wheel({ deltaX: 40, deltaY: 10 }));
    expect(editor.scene.viewport.pan).not.toEqual(p0);
  });

  it("shift+vertical wheel pans horizontally", () => {
    const { editor, handlers } = makeEditor();
    const p0 = editor.scene.viewport.pan;
    handlers.get("wheel")!(wheel({ shiftKey: true, deltaY: 40 }));
    expect(editor.scene.viewport.pan.x).not.toBe(p0.x);
  });

  it("plain vertical wheel zooms", () => {
    const { editor, handlers } = makeEditor();
    const z0 = editor.scene.viewport.zoom;
    handlers.get("wheel")!(wheel({ deltaY: -100 }));
    expect(editor.scene.viewport.zoom).not.toBe(z0);
  });
});

describe("contextmenu suppression + pointercancel", () => {
  it("suppresses the native menu exactly once after a right-click arm", () => {
    const { editor, handlers } = makeEditor();
    const flag = editor as unknown as { suppressNextContextMenu: boolean };
    flag.suppressNextContextMenu = true;

    let prevented = false;
    handlers.get("contextmenu")!({
      preventDefault: () => (prevented = true),
      stopPropagation: noop,
    });
    expect(prevented).toBe(true);
    expect(flag.suppressNextContextMenu).toBe(false);

    // Not armed → early return, native menu allowed through.
    let prevented2 = false;
    handlers.get("contextmenu")!({
      preventDefault: () => (prevented2 = true),
      stopPropagation: noop,
    });
    expect(prevented2).toBe(false);
  });

  it("pointercancel runs without an active gesture", () => {
    const { handlers } = makeEditor();
    expect(() => handlers.get("pointercancel")!({ pointerId: 1 })).not.toThrow();
  });
});
