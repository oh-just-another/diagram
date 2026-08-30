/**
 * Object snapping + size assists through real pointer gestures: a dragged
 * shape lands on a neighbour's edge (with a guide), a resize suggests a
 * neighbour's width and publishes the `W × H` readout, and the
 * `snapObjects` / `suggestObjectSize` / `showObjectSize` preferences turn
 * each assist off.
 */
import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  getElement,
  resolveSnapSpacing,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { handlePosition } from "../src/interaction/handle.js";
import { getElementWorldBounds } from "@oh-just-another/scene";

const rect = (id: string, x: number, y: number, w = 40, h = 40): Element => ({
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

const brush = (id: string, x: number, y: number): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "brush",
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: { stroke: "#000", strokeWidth: 4 },
    points: [
      { x: 0, y: 0, width: 4 },
      { x: 80, y: 0, width: 4 },
      { x: 80, y: 30, width: 4 },
    ],
  }) as unknown as Element;

const sceneWith = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of elements) s = addElement(s, sh).scene;
  return s;
};

const noop = () => undefined;
const targetBase: Record<string, unknown> = {
  measureText: () => ({ width: 0 }),
  size: { width: 400, height: 400 },
};
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;

const makeHost = () => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const host = {
    addEventListener: (t: string, fn: (ev: unknown) => void) => handlers.set(t, fn),
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
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

// "a" at (0,0) 40×40; "b" at (100,120) 80×30 — far enough that only the
// intended lines are within the 6 px threshold.
const setup = (
  configure?: (e: Editor) => void,
  scene: Scene = sceneWith(rect("a", 0, 0), rect("b", 100, 120, 80, 30)),
) => {
  const { host, handlers } = makeHost();
  const editor = new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });
  editor.setViewportSize(400, 400);
  configure?.(editor);
  const down = (x: number, y: number) => handlers.get("pointerdown")!(pointer("pointerdown", x, y));
  const move = (x: number, y: number) => handlers.get("pointermove")!(pointer("pointermove", x, y));
  const up = (x: number, y: number) => handlers.get("pointerup")!(pointer("pointerup", x, y));
  const tap = (x: number, y: number) => {
    down(x, y);
    up(x, y);
  };
  return { editor, down, move, up, tap };
};

describe("object snapping (end-to-end through pointer)", () => {
  it("snaps a dragged shape's edge to a neighbour's edge and shows a guide", () => {
    const { editor, down, move, up } = setup();
    // Drag "a" so its left edge lands 3 px short of b's left edge (x=100).
    down(20, 20);
    move(20 + 97, 20);
    expect(editor.snapGuides.some((g) => g.axis === "x" && g.at === 100)).toBe(true);
    up(20 + 97, 20);
    expect(getElement(editor.scene, elementId("a"))!.position.x).toBe(100);
    // Guides are gone once the gesture ends.
    expect(editor.snapGuides).toEqual([]);
  });

  it("keeps grid snapping on the axis object snapping did not take", () => {
    // Grid + object snapping both on. The drag aligns x with b's left edge
    // (a guide), while y lands off-grid: the free axis must still snap to
    // the grid instead of following the raw pointer.
    const { editor, down, move, up } = setup((e) => {
      e.setGridVisible(true);
      e.setSnapToGrid(true);
    });
    down(20, 20);
    move(20 + 97, 20 + 13);
    expect(editor.snapGuides.some((g) => g.axis === "x" && g.at === 100)).toBe(true);
    expect(editor.snapGuides.some((g) => g.axis === "y")).toBe(false);
    up(20 + 97, 20 + 13);
    const a = getElement(editor.scene, elementId("a"))!;
    expect(a.position.x).toBe(100);
    expect(a.position.y % resolveSnapSpacing()).toBe(0);
  });

  it("does not snap when the snapObjects preference is off", () => {
    const { editor, down, move, up } = setup((e) => {
      e.setPreferences({ snapObjects: false });
    });
    down(20, 20);
    move(117, 20);
    expect(editor.snapGuides).toEqual([]);
    up(117, 20);
    expect(getElement(editor.scene, elementId("a"))!.position.x).toBe(97);
  });

  it("suggests a neighbour's width while resizing and publishes the size readout", () => {
    const { editor, tap, down, move, up } = setup();
    tap(20, 20); // select "a"
    const a = getElement(editor.scene, elementId("a"))!;
    const grip = handlePosition("e", getElementWorldBounds(a), 1);
    // Drag the east edge to width 83 → suggested 80 (b's width).
    down(grip.x, grip.y);
    move(grip.x + 43, grip.y);
    expect(editor.sizeReadout?.width).toBe(80);
    expect(editor.sizeMatch).toEqual({
      bounds: { x: 100, y: 120, width: 80, height: 30 },
      axis: "width",
    });
    up(grip.x + 43, grip.y);
    expect((getElement(editor.scene, elementId("a")) as { width: number }).width).toBe(80);
    expect(editor.sizeReadout).toBeNull();
  });

  it("suggestObjectSize / showObjectSize off → free resize, no readout", () => {
    const { editor, tap, down, move, up } = setup((e) => {
      e.setPreferences({ suggestObjectSize: false, showObjectSize: false });
    });
    tap(20, 20);
    const a = getElement(editor.scene, elementId("a"))!;
    const grip = handlePosition("e", getElementWorldBounds(a), 1);
    down(grip.x, grip.y);
    move(grip.x + 43, grip.y);
    expect(editor.sizeReadout).toBeNull();
    expect(editor.sizeMatch).toBeNull();
    up(grip.x + 43, grip.y);
    expect((getElement(editor.scene, elementId("a")) as { width: number }).width).toBe(83);
  });
});

describe("object snapping participation (reference rules)", () => {
  it("a brush stroke is neither a snap target nor a snapping mover", () => {
    // Target: dragging "a" next to a brush stroke at x=100 → no snap.
    const asTarget = setup(undefined, sceneWith(rect("a", 0, 0), brush("ink", 100, 120)));
    asTarget.down(20, 20);
    asTarget.move(117, 20);
    expect(asTarget.editor.snapGuides).toEqual([]);
    asTarget.up(117, 20);
    expect(getElement(asTarget.editor.scene, elementId("a"))!.position.x).toBe(97);
    // Mover: dragging the stroke next to a rect → no snap either.
    const asMover = setup(undefined, sceneWith(brush("ink", 0, 0), rect("b", 100, 120, 80, 30)));
    asMover.down(40, 2);
    asMover.move(40 + 97, 2);
    expect(asMover.editor.snapGuides).toEqual([]);
    asMover.up(40 + 97, 2);
    expect(getElement(asMover.editor.scene, elementId("ink"))!.position.x).toBe(97);
  });

  it("shapes rotated off the 90° grid and shapes too small on screen are not targets", () => {
    const tilted = { ...rect("b", 100, 120, 80, 30), rotation: Math.PI / 6 };
    const t = setup(undefined, sceneWith(rect("a", 0, 0), tilted));
    t.down(20, 20);
    t.move(117, 20);
    expect(t.editor.snapGuides).toEqual([]);
    // A 90° turn keeps it a target.
    const quarter = { ...rect("b", 100, 120, 80, 30), rotation: Math.PI / 2 };
    const q = setup(undefined, sceneWith(rect("a", 0, 0), quarter));
    q.down(20, 20);
    q.move(117, 20);
    expect(q.editor.snapGuides.length).toBeGreaterThan(0);
    // 10×10 px on screen at zoom 1 → below OBJECT_SNAP_MIN_SIZE_PX (18).
    const tiny = setup(undefined, sceneWith(rect("a", 0, 0), rect("b", 100, 120, 10, 10)));
    tiny.down(20, 20);
    tiny.move(117, 20);
    expect(tiny.editor.snapGuides).toEqual([]);
  });
});
