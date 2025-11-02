import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  getElementWorldBounds,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { anchorOverlayPoints } from "../src/editor/anchor-points.js";
import { LINK_START_ANCHOR_OUTSET } from "../src/constants.js";

// 40×40 rect at (x,y); centre = (x+20, y+20).
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

// Resolve a named link-start dot's world position for rect "a" (origin).
const dotWorld = (name: string) => {
  let s = emptyScene();
  ({ scene: s } = addElement(s, rect("a", 0, 0)));
  const shape = [...s.elements.values()][0]!;
  const { names, worldPoints } = anchorOverlayPoints(shape, LINK_START_ANCHOR_OUTSET);
  const idx = names.indexOf(name);
  return worldPoints[idx]!;
};

describe("click a link-start dot → create new element + link", () => {
  const setup = () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host, mainTarget: noopTarget, overlayTarget: noopTarget,
      initialScene: sceneWith(rect("a", 0, 0)),
    });
    const down = (x: number, y: number) => handlers.get("pointerdown")!(pointer("pointerdown", x, y));
    const move = (x: number, y: number) => handlers.get("pointermove")!(pointer("pointermove", x, y));
    const up = (x: number, y: number) => handlers.get("pointerup")!(pointer("pointerup", x, y));
    const tap = (x: number, y: number) => { down(x, y); up(x, y); };
    return { editor, tap, down, move, up };
  };

  it("a click exactly on the east dot creates a linked clone to the right", () => {
    const { editor, tap } = setup();
    tap(20, 20); // select A
    const east = dotWorld("right");
    const elemsBefore = editor.scene.elements.size;
    const linksBefore = editor.scene.links.size;
    tap(east.x, east.y); // click the dot
    expect(editor.scene.elements.size).toBe(elemsBefore + 1); // new element
    expect(editor.scene.links.size).toBe(linksBefore + 1); // linked

    // The new element is selected and sits to the right of A.
    const sel = [...editor.selection];
    expect(sel.length).toBe(1);
    const newEl = editor.scene.elements.get(sel[0]!)!;
    const aB = getElementWorldBounds(editor.scene.elements.get(elementId("a"))!);
    const nB = getElementWorldBounds(newEl);
    expect(nB.x).toBeGreaterThan(aB.x + aB.width); // strictly to the right, with a gap
    // Same kind + size as the source, fresh (different id).
    expect(newEl.type).toBe("rectangle");
    expect(nB.width).toBe(aB.width);
    expect(nB.height).toBe(aB.height);
    expect(newEl.id).not.toBe(elementId("a"));
  });

  it("the create + link is a single undo step", () => {
    const { editor, tap } = setup();
    tap(20, 20);
    const east = dotWorld("right");
    tap(east.x, east.y);
    expect(editor.scene.elements.size).toBe(2);
    expect(editor.scene.links.size).toBe(1);
    editor.undo();
    expect(editor.scene.elements.size).toBe(1); // both element and link gone
    expect(editor.scene.links.size).toBe(0);
  });

  it("the south dot spawns the clone below the source", () => {
    const { editor, tap } = setup();
    tap(20, 20);
    const south = dotWorld("bottom");
    tap(south.x, south.y);
    const sel = [...editor.selection];
    const newEl = editor.scene.elements.get(sel[0]!)!;
    const aB = getElementWorldBounds(editor.scene.elements.get(elementId("a"))!);
    const nB = getElementWorldBounds(newEl);
    expect(nB.y).toBeGreaterThan(aB.y + aB.height);
  });

  it("a click in the halo but NOT on a dot still deselects (no new element)", () => {
    const { editor, tap } = setup();
    tap(20, 20);
    // (58,20): 10px from the east dot (48,20) — inside the 11px grab halo
    // (press is captured) but outside the 7px click radius (not a create),
    // and hit-tests as empty canvas → deselect. (55,20) would sit exactly
    // on the 7px boundary, so use 58 for clearance.
    tap(58, 20);
    expect([...editor.selection]).toEqual([]);
    expect(editor.scene.elements.size).toBe(1); // nothing created
    expect(editor.scene.links.size).toBe(0);
  });
});
