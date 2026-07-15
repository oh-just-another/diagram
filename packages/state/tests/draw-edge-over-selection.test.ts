/**
 * Regression: with the Link tool (draw-edge) active, a press on a SELECTED
 * shape's edge must start a new link from that shape — not grab the shape's
 * resize handle (the selection chrome is a select-tool affordance; see
 * `selectionChromeActive` in the press hit-test).
 */
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

const rect = (id: string, x: number, y: number, w: number, h: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: w,
  height: h,
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

// a at (100,100) 120×80 (right edge x=220, mid y=140); b at (400,100) 120×80.
const scene = (): Scene => {
  let s = emptyScene();
  s = addElement(s, rect("a", 100, 100, 120, 80)).scene;
  s = addElement(s, rect("b", 400, 100, 120, 80)).scene;
  return s;
};

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
  return { editor, down, move, up };
};

// A point 2px inside a's right-edge midpoint: inside the shape body AND within
// the side-handle hit slop, so under the select tool it resolves to the "e"
// resize handle.
const NEAR_RIGHT_EDGE = { x: 218, y: 140 } as const;

describe("draw-edge over a selected shape", () => {
  it("hitTest: the same point is a resize handle in select mode, the element in draw-edge", () => {
    const { editor } = harness();
    editor.setSelection([elementId("a")]);
    expect(editor.hitTest(NEAR_RIGHT_EDGE).kind).toBe("handle");
    editor.setActiveTool("draw-edge");
    expect(editor.hitTest(NEAR_RIGHT_EDGE).kind).toBe("element");
  });

  it("drag from the selected shape's edge draws a link and does NOT resize", () => {
    const { editor, down, move, up } = harness();
    editor.setSelection([elementId("a")]);
    editor.setActiveTool("draw-edge");

    down(NEAR_RIGHT_EDGE.x, NEAR_RIGHT_EDGE.y);
    move(450, 140);
    up(450, 140); // release over b → the link binds to it

    expect(editor.scene.links.size).toBe(1);
    const link = [...editor.scene.links.values()][0]!;
    expect(link.from.kind === "point" ? null : link.from.elementId).toBe(elementId("a"));
    // The rect was not resized by the gesture.
    const a = getElement(editor.scene, elementId("a"))! as Element & { width: number };
    expect(a.width).toBe(120);
    expect(a.position).toEqual({ x: 100, y: 100 });
  });

  it("selected-link endpoint handles are also inert outside select mode", () => {
    const { editor, down, move, up } = harness();
    editor.setActiveTool("draw-edge");
    // Draw a first link a→b, then (still in draw-edge, tool locked) a press on
    // its endpoint must start a NEW link, not re-bind the existing one.
    editor.setToolLocked(true);
    down(NEAR_RIGHT_EDGE.x, NEAR_RIGHT_EDGE.y);
    move(450, 140);
    up(450, 140);
    expect(editor.scene.links.size).toBe(1);

    const endpoint = editor.hitTest({ x: 450, y: 140 });
    expect(endpoint.kind).not.toBe("edge-endpoint");
  });

  it("resize handles still work under the select tool (no regression)", () => {
    const { editor, down, move, up } = harness();
    editor.setSelection([elementId("a")]);
    expect(editor.hitTest(NEAR_RIGHT_EDGE).kind).toBe("handle");
    down(NEAR_RIGHT_EDGE.x, NEAR_RIGHT_EDGE.y);
    move(320, 140);
    up(320, 140);
    const a = getElement(editor.scene, elementId("a"))! as Element & { width: number };
    expect(a.width).toBeGreaterThan(120);
  });
});
