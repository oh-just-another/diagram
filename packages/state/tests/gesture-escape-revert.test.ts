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

const rect = (id: string, x: number, y: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 40,
  height: 40,
});

const noopTarget = new Proxy(
  { measureText: () => ({ width: 0 }), size: { width: 800, height: 600 } } as Record<
    string,
    unknown
  >,
  { get: (o, k: string) => (k in o ? o[k] : () => undefined) },
) as never;

const makeHost = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (t: string, fn: (ev: unknown) => void) => handlers.set(t, fn),
    removeEventListener: (t: string) => handlers.delete(t),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: { cursor: "" },
  } as never;
  return { host, handlers };
};

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
  preventDefault: () => undefined,
});

const scene = (): Scene => addElement(emptyScene(), rect("a", 0, 0)).scene;

const harness = () => {
  const { host, handlers } = makeHost();
  const editor = new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene(),
  });
  editor.setViewportSize(800, 600);
  const down = (x: number, y: number) => handlers.get("pointerdown")!(pe("pointerdown", x, y));
  const move = (x: number, y: number) => handlers.get("pointermove")!(pe("pointermove", x, y));
  const up = (x: number, y: number) => handlers.get("pointerup")!(pe("pointerup", x, y));
  const pos = () => editor.scene.elements.get(elementId("a"))!.position;
  return { editor, down, move, up, pos };
};

describe("Escape reverts an in-progress gesture (any move)", () => {
  it("element move: Esc mid-drag restores the original position", () => {
    const { editor, down, move, pos } = harness();
    down(20, 20); // press on the element
    move(120, 120); // drag it (delta +100,+100) — moves live
    expect(pos()).toEqual({ x: 100, y: 100 });
    editor.cancelInteraction(); // Esc
    expect(pos()).toEqual({ x: 0, y: 0 });
  });

  it("element move: a committed drag is one undo step", () => {
    const { editor, down, move, up, pos } = harness();
    down(20, 20);
    move(120, 120);
    up(120, 120);
    expect(pos()).toEqual({ x: 100, y: 100 });
    editor.undo();
    expect(pos()).toEqual({ x: 0, y: 0 });
  });

  it("Esc with no gesture in flight doesn't corrupt the scene", () => {
    const { editor, pos } = harness();
    editor.cancelInteraction();
    expect(pos()).toEqual({ x: 0, y: 0 });
  });
});
