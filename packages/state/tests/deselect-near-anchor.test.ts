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

// Geometry (verified by instrumentation): rect "a" at the origin covers
// world 0..40. Its resize handles sit on / just outside that edge, and
// its link-start anchor dots sit 8px further out (LINK_START_ANCHOR_OUTSET)
// with an 11px grab radius. The point (55,20) lands in the gap PAST the
// east resize handle but still INSIDE the anchor grab halo: it hit-tests
// as empty canvas yet is grabbed by the host-managed link-from-anchor
// gesture on pointerdown. That combination is the bug: the grabbed
// gesture used to return on pointerup without running click semantics, so
// a click there left the selection intact and the user had to click again
// further out ("two clicks to deselect"). The fix makes a non-dragging
// grab fall back to hit-test-based select/deselect.
const HALO_EMPTY = { x: 55, y: 20 } as const;

describe("deselect near a selected element's anchor halo", () => {
  it("a single click in the anchor halo over empty canvas clears the selection", () => {
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
    tap(HALO_EMPTY.x, HALO_EMPTY.y); // click in the anchor halo (empty canvas)
    expect([...editor.selection]).toEqual([]); // cleared on the first click
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
    down(HALO_EMPTY.x, HALO_EMPTY.y); // press in the anchor halo
    move(110, 110); // drag onto B
    up(120, 120);
    expect(editor.scene.links.size).toBe(before + 1); // link drawn
    expect([...editor.selection]).toEqual([elementId("a")]); // selection untouched
  });
});
