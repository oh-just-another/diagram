import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  getElement,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

// Off-grid 40×40 rect so snapping has something to pull onto the grid.
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
  resetTransform: () => {}, size: { width: 400, height: 400 },
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

describe("snap-to-grid move gesture (end-to-end)", () => {
  const setup = (configure?: (e: Editor) => void) => {
    const { host, handlers } = makeHost();
    // Rect top-left at (13,7) — off the 20-unit grid.
    const editor = new Editor({
      host,
      mainTarget: noopTarget,
      overlayTarget: noopTarget,
      initialScene: sceneWith(rect("a", 13, 7)),
    });
    configure?.(editor);
    const tap = (x: number, y: number) => {
      handlers.get("pointerdown")!(pointer("pointerdown", x, y));
      handlers.get("pointerup")!(pointer("pointerup", x, y));
    };
    const drag = (from: [number, number], to: [number, number]) => {
      handlers.get("pointerdown")!(pointer("pointerdown", from[0], from[1]));
      handlers.get("pointermove")!(pointer("pointermove", to[0], to[1]));
      handlers.get("pointerup")!(pointer("pointerup", to[0], to[1]));
    };
    return { editor, tap, drag };
  };

  it("snaps a dragged element onto the grid (default on, no visible grid)", () => {
    const { editor, tap, drag } = setup();
    // Snap defaults to ON even with no gridSize (falls back to spacing 20).
    expect(editor.snapToGridEnabled).toBe(true);
    tap(33, 27); // inside the rect → select
    // press-time top-left (13,7); drag +12/+12 → (25,19) → snaps to (20,20).
    drag([33, 27], [45, 39]);
    const a = getElement(editor.scene, elementId("a"))!;
    expect(a.position.x).toBe(20);
    expect(a.position.y).toBe(20);
  });

  it("moves freely (no rounding) when snap is toggled off", () => {
    const { editor, tap, drag } = setup((e) => { e.setSnapToGrid(false); });
    expect(editor.snapToGridEnabled).toBe(false);
    tap(33, 27);
    drag([33, 27], [45, 39]);
    const a = getElement(editor.scene, elementId("a"))!;
    expect(a.position.x).toBe(25); // 13 + 12
    expect(a.position.y).toBe(19); // 7 + 12
  });

  it("suppresses snap for the gesture while the modifier flag is set", () => {
    const { editor, tap, drag } = setup();
    tap(33, 27);
    editor.setSnapSuppressed(true); // Cmd/Ctrl held
    drag([33, 27], [45, 39]);
    const a = getElement(editor.scene, elementId("a"))!;
    expect(a.position.x).toBe(25);
    expect(a.position.y).toBe(19);
  });

  it("respects the visible gridSize over the fallback", () => {
    const { editor, tap, drag } = setup((e) => { e.setGrid({ size: 50 }); });
    tap(33, 27);
    // press-time (13,7) +12/+12 → (25,19); on a 50-grid that rounds to
    // (50,0): 25/50 = 0.5 → 50, 19/50 ≈ 0.38 → 0.
    drag([33, 27], [45, 39]);
    const a = getElement(editor.scene, elementId("a"))!;
    expect(a.position.x).toBe(50);
    expect(a.position.y).toBe(0);
  });

  it("setSnapToGrid persists in the viewport", () => {
    const { editor } = setup((e) => { e.setSnapToGrid(false); });
    expect(editor.scene.viewport.snapToGrid).toBe(false);
    editor.setSnapToGrid(true);
    expect(editor.scene.viewport.snapToGrid).toBe(true);
  });
});
