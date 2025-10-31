import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

// A 40×40 rect placed at (x,y). Its centre is (x+20, y+20).
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

const sceneWith = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of elements) s = addElement(s, sh).scene;
  return s;
};

const noopTarget = {
  save: () => {}, restore: () => {}, setTransform: () => {}, clear: () => {},
  setFill: () => {}, setStroke: () => {}, setStrokeWidth: () => {},
  setOpacity: () => {}, setLineCap: () => {}, setLineJoin: () => {},
  setDashArray: () => {}, setFont: () => {}, setTextAlign: () => {},
  setTextBaseline: () => {}, beginPath: () => {}, closePath: () => {},
  moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {},
  bezierCurveTo: () => {}, rect: () => {}, ellipse: () => {},
  fill: () => {}, stroke: () => {}, fillText: () => {},
  measureText: () => ({ width: 0 }), drawImage: () => {},
  translate: () => {}, rotate: () => {}, scale: () => {},
  resetTransform: () => {}, size: { width: 800, height: 600 },
} as never;

const makeHost = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (type: string, fn: (ev: unknown) => void) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: { cursor: "" },
  } as never;
  return { host, handlers };
};

const pointer = (type: string, x: number, y: number) => ({
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
  preventDefault: () => {},
});

// Geometry: rect "a" at the origin covers world 0..40. Its link-start
// anchor dots sit 8px outside (LINK_START_ANCHOR_OUTSET) with an 11px
// grab radius. The MIDDLE-of-edge dots — north (20,-8), south (20,48),
// west (-8,20) — land in empty canvas BEYOND the shape's resize handles
// (which sit on the 0..40 edges). So a press at (20,-8) is grabbed as a
// link-start anchor gesture, but a non-dragging release there must still
// deselect (the "two clicks to deselect" bug: the grabbed gesture used to
// return without running click semantics). The east dot (48,20) happens
// to overlap the east resize handle, so it isn't a deselect spot — we use
// the north dot (20,-8) which is unambiguously empty canvas.
describe("deselect near a selected element's anchor halo", () => {
  const NORTH_DOT = { x: 20, y: -8 } as const;

  it("a single click on a north anchor dot over empty canvas clears the selection", () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget,
      initialScene: sceneWith(rect("a", 0, 0)),
    });
    const tap = (x: number, y: number) => {
      handlers.get("pointerdown")!(pointer("pointerdown", x, y));
      handlers.get("pointerup")!(pointer("pointerup", x, y));
    };
    tap(20, 20); // select A
    expect([...editor.selection]).toEqual([elementId("a")]);
    tap(NORTH_DOT.x, NORTH_DOT.y); // click the north anchor dot (empty canvas)
    expect([...editor.selection]).toEqual([]); // cleared on the first click
  });

  it("a click on an anchor dot that overlaps another shape selects that shape", () => {
    const { host, handlers } = makeHost();
    // B covers A's north dot (20,-8): B at (0,-40) → 0..40 x, -40..0 y.
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget,
      initialScene: sceneWith(rect("a", 0, 0), rect("b", 0, -40)),
    });
    const tap = (x: number, y: number) => {
      handlers.get("pointerdown")!(pointer("pointerdown", x, y));
      handlers.get("pointerup")!(pointer("pointerup", x, y));
    };
    tap(20, 20); // select A
    tap(NORTH_DOT.x, NORTH_DOT.y); // dot lands on B's body
    expect([...editor.selection]).toEqual([elementId("b")]);
  });

  it("still draws a link when the anchor press actually drags", () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget,
      initialScene: sceneWith(rect("a", 0, 0), rect("b", 100, 100)),
    });
    const down = (x: number, y: number) => handlers.get("pointerdown")!(pointer("pointerdown", x, y));
    const move = (x: number, y: number) => handlers.get("pointermove")!(pointer("pointermove", x, y));
    const up = (x: number, y: number) => handlers.get("pointerup")!(pointer("pointerup", x, y));

    const before = editor.scene.links.size;
    down(20, 20); up(20, 20); // select A
    down(NORTH_DOT.x, NORTH_DOT.y); // press the north anchor dot
    move(110, 110); // drag onto B
    up(120, 120);
    expect(editor.scene.links.size).toBe(before + 1); // link drawn
    expect([...editor.selection]).toEqual([elementId("a")]); // selection untouched
  });
});
