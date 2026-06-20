import { describe, expect, it } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  orderBetween,
  getElement,
  getLink,
  type Scene,
  type Element,
  type Link,
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
  quadraticCurveTo: () => {},
  bezierCurveTo: () => {},
  rect: () => {},
  ellipse: () => {},
  fill: () => {},
  stroke: () => {},
  fillText: () => {},
  measureText: () => ({ width: 0 }),
  drawImage: () => {},
  translate: () => {},
  rotate: () => {},
  scale: () => {},
  resetTransform: () => {},
  size: { width: 400, height: 400 },
} as never;

const makeHost = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (type: string, fn: (ev: unknown) => void) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    style: { cursor: "" },
  } as never;
  return { host, handlers };
};

const pointer = (type: string, x: number, y: number, shift = false) => ({
  type,
  clientX: x,
  clientY: y,
  pointerId: 1,
  pointerType: "mouse",
  button: 0,
  buttons: type === "pointerup" ? 0 : 1,
  shiftKey: shift,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  timeStamp: 0,
  preventDefault: () => {},
});

describe("group resize gesture (end-to-end through pointer)", () => {
  // Two 40×40 rects: A at world (0,0), B at (100,0). Identity viewport
  // and host at the origin → client coords equal world coords. Combined
  // selection bounds = x∈[0,140], y∈[0,40]; SE corner at (140,40).
  const setup = () => {
    const { host, handlers } = makeHost();
    const editor = new Editor({
      host,
      mainTarget: noopTarget,
      overlayTarget: noopTarget,
      initialScene: sceneWith(rect("a", 0), rect("b", 100)),
    });
    const tap = (x: number, y: number, shift = false) => {
      handlers.get("pointerdown")!(pointer("pointerdown", x, y, shift));
      handlers.get("pointerup")!(pointer("pointerup", x, y, shift));
    };
    const drag = (from: [number, number], to: [number, number]) => {
      handlers.get("pointerdown")!(pointer("pointerdown", from[0], from[1]));
      handlers.get("pointermove")!(pointer("pointermove", to[0], to[1]));
      handlers.get("pointerup")!(pointer("pointerup", to[0], to[1]));
    };
    return { editor, tap, drag };
  };

  it("dragging the SE corner of a multi-selection scales all members", () => {
    const { editor, tap, drag } = setup();
    tap(20, 20); // select A
    tap(120, 20, true); // shift-add B → {A,B}
    expect(editor.selection.size).toBe(2);

    // Drag the SE corner (140,40) east by 100 → x scale = 240/140 ≈ 1.714.
    expect(() => drag([140, 40], [240, 40])).not.toThrow();

    const a = getElement(editor.scene, elementId("a"))!;
    const b = getElement(editor.scene, elementId("b"))!;
    // Both rects grew horizontally...
    expect((a as Element & { width: number }).width).toBeGreaterThan(40);
    expect((b as Element & { width: number }).width).toBeGreaterThan(40);
    // ...and B moved further right (its offset from the anchor scaled).
    expect(b.position.x).toBeGreaterThan(100);
    // Anchor (NW corner) stayed put.
    expect(a.position.x).toBeCloseTo(0, 5);
  });

  it("includes a selected link in the box and scales its point endpoints", () => {
    const { host, handlers } = makeHost();
    // Element A (0,0)-(40,40) + a free link from (0,0) to (100,100).
    let scene = sceneWith(rect("a", 0));
    const free: Link = {
      id: linkId("L"),
      layerId: DEFAULT_LAYER_ID,
      from: { kind: "point", position: { x: 0, y: 0 } },
      to: { kind: "point", position: { x: 100, y: 100 } },
      routing: "straight",
      order: orderBetween(null, null),
      style: { stroke: "#000" },
    };
    scene = addLink(scene, free).scene;
    const editor = new Editor({
      host,
      mainTarget: noopTarget,
      overlayTarget: noopTarget,
      initialScene: scene,
    });
    editor.applyEmit({ type: "SELECT_REPLACE", id: elementId("a") });
    editor.applyEmit({ type: "SELECT_EDGE_TOGGLE", id: linkId("L") });

    // The link extends the selection box to its path AABB → SE corner (100,100).
    const bounds = editor.combinedSelectionBounds()!;
    expect(bounds.x + bounds.width).toBeCloseTo(100, 5);
    expect(bounds.y + bounds.height).toBeCloseTo(100, 5);

    // Drag SE corner (100,100) → (200,100): sx=2, sy=1, anchor NW (0,0).
    handlers.get("pointerdown")!(pointer("pointerdown", 100, 100));
    handlers.get("pointermove")!(pointer("pointermove", 200, 100));
    handlers.get("pointerup")!(pointer("pointerup", 200, 100));

    const moved = getLink(editor.scene, linkId("L"));
    expect(moved?.from).toEqual({ kind: "point", position: { x: 0, y: 0 } });
    expect(moved?.to).toEqual({ kind: "point", position: { x: 200, y: 100 } });
  });
});
