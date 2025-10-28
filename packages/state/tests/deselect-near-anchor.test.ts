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

const rect = (id: string, x: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y: 0 },
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

describe("deselect near a selected element's anchor halo", () => {
  // One rect "a", body covers world 0..40 on both axes (centred 20,20).
  // The link-start anchor dots sit 8px outside that, with an 11px grab
  // radius — so a click at ~50,20 lands in the anchor grab halo but on
  // empty canvas (off the shape body).
  const setup = () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host,
      mainTarget: noopTarget,
      overlayTarget: noopTarget,
      initialScene: sceneWith(rect("a", 0), rect("b", 200)),
    });
    const down = (x: number, y: number) => handlers.get("pointerdown")!(pointer("pointerdown", x, y));
    const move = (x: number, y: number) => handlers.get("pointermove")!(pointer("pointermove", x, y));
    const up = (x: number, y: number) => handlers.get("pointerup")!(pointer("pointerup", x, y));
    const tap = (x: number, y: number) => { down(x, y); up(x, y); };
    return { editor, tap, down, move, up };
  };

  it("a single click in the anchor halo (empty canvas) clears the selection — no second click", () => {
    const { editor, tap } = setup();
    tap(20, 20); // select A
    expect([...editor.selection]).toEqual([elementId("a")]);
    tap(50, 20); // click just off A, inside the anchor grab halo
    expect([...editor.selection]).toEqual([]); // cleared on the first click
  });

  it("a click in the halo that lands on another shape selects that shape", () => {
    const { editor, tap } = setup();
    tap(20, 20); // select A
    // Place B's left edge at 200; click its body.
    tap(220, 20);
    expect([...editor.selection]).toEqual([elementId("b")]);
  });

  it("still draws a link when the anchor press actually drags", () => {
    const { editor, down, move, up } = setup();
    const linkCountBefore = editor.scene.links.size;
    down(20, 20); up(20, 20); // select A
    // Press on A's right anchor halo, drag onto B, release → CREATE_EDGE.
    down(50, 20);
    move(210, 20);
    up(220, 20);
    expect(editor.scene.links.size).toBe(linkCountBefore + 1);
    // Selection is untouched by the link-draw gesture.
    expect([...editor.selection]).toEqual([elementId("a")]);
  });
});
