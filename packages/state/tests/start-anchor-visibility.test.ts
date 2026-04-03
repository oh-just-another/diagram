import { describe, expect, it, vi } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { installBuiltinRenderers } from "@oh-just-another/renderer-core";
import { Editor } from "../src/editor.js";

// Need real shape renderers so the main pass behaves; the overlay pass
// (which paints the port dots we assert on) runs regardless.
installBuiltinRenderers();

// Both resize handles AND link-anchor port dots render via `ellipse`, so
// a raw ellipse count is NOT a clean "anchors visible?" signal on its own
// (a single resizable selection draws 8 handle ellipses regardless). We
// therefore compare ellipse counts between states: the DIFFERENCE between
// "selection at rest" and "mid-drag" is exactly the link-start dots, since
// handles are painted in both.
const makeTarget = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  setTransform: vi.fn(),
  resetTransform: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  clear: vi.fn(),
  setFill: vi.fn(),
  setStroke: vi.fn(),
  setStrokeWidth: vi.fn(),
  setOpacity: vi.fn(),
  setLineCap: vi.fn(),
  setLineJoin: vi.fn(),
  setDashArray: vi.fn(),
  setFont: vi.fn(),
  setTextAlign: vi.fn(),
  setTextBaseline: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  rect: vi.fn(),
  ellipse: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  drawImage: vi.fn(),
  drawPoint: vi.fn(),
  size: { width: 800, height: 600 },
});

const host = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  style: {},
} as never;

const rect = (id: string, x = 100, y = 100): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 50,
  height: 50,
});

const sceneWith = (...shapes: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of shapes) s = addElement(s, sh).scene;
  return s;
};

/** Count `ellipse` calls produced by a single forced render. */
const renderEllipses = (editor: Editor, overlay: ReturnType<typeof makeTarget>): number => {
  overlay.ellipse.mockClear();
  editor.forceRender();
  return overlay.ellipse.mock.calls.length;
};

describe("link-start anchor visibility on selection", () => {
  it("paints more dots at rest than mid-drag (the start anchors)", () => {
    const overlay = makeTarget();
    const editor = new Editor({
      host,
      mainTarget: makeTarget() as never,
      overlayTarget: overlay as never,
      initialScene: sceneWith(rect("a")),
    });
    editor.setViewportSize(800, 600);
    editor.setSelection([elementId("a")]);
    editor.setHoverLinkStart(elementId("a"), { x: 125, y: 125 }); // hover over the selected element so start dots show

    const atRest = renderEllipses(editor, overlay);

    // A real drag is in flight — the gesture transaction is open (it opens
    // on the first move-emitted patch). Start anchors must hide; only the
    // resize handles remain.
    (editor as any).gestureTx = { add: () => {}, commit: () => {}, cancel: () => {} };
    const midDrag = renderEllipses(editor, overlay);

    expect(atRest).toBeGreaterThan(midDrag);
    editor.dispose();
  });

  it("keeps start anchors on a bare press (dragElementId set, no gesture tx)", () => {
    // `dragElementId` is set on pointerdown as a *potential* drag, in the
    // same beat as selection. A bare press must not hide the start dots.
    const overlay = makeTarget();
    const editor = new Editor({
      host,
      mainTarget: makeTarget() as never,
      overlayTarget: overlay as never,
      initialScene: sceneWith(rect("a")),
    });
    editor.setViewportSize(800, 600);
    editor.setSelection([elementId("a")]);
    editor.setHoverLinkStart(elementId("a"), { x: 125, y: 125 }); // hover over the selected element so start dots show

    const atRest = renderEllipses(editor, overlay);

    // Simulate the post-pointerdown state: a press landed on the shape
    // (dragElementId set) but the user hasn't moved, so no gesture tx.
    (editor as any).dragElementId = elementId("a");
    const onPress = renderEllipses(editor, overlay);

    // A bare press must NOT drop any dots — the anchors stay visible.
    expect(onPress).toBe(atRest);
    editor.dispose();
  });

  it("hides start anchors during a real drag (gesture tx open)", () => {
    const overlay = makeTarget();
    const editor = new Editor({
      host,
      mainTarget: makeTarget() as never,
      overlayTarget: overlay as never,
      initialScene: sceneWith(rect("a")),
    });
    editor.setViewportSize(800, 600);
    editor.setSelection([elementId("a")]);
    editor.setHoverLinkStart(elementId("a"), { x: 125, y: 125 }); // hover over the selected element so start dots show

    const atRest = renderEllipses(editor, overlay);
    (editor as any).gestureTx = { add: () => {}, commit: () => {}, cancel: () => {} };
    const midDrag = renderEllipses(editor, overlay);

    // Drag drops the anchor dots but keeps the resize handles.
    expect(midDrag).toBeLessThan(atRest);
    expect(midDrag).toBeGreaterThan(0); // handles still painted
    editor.dispose();
  });
});
