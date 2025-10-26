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

// Overlay port dots are drawn with `ellipse`; resize handles use `rect`
// and the selection outline uses `rect`/`stroke`. So for a plain
// single-rectangle selection with no edge / brush / peer overlays, every
// `ellipse` call on the overlay target is a link-anchor dot — making the
// call count a clean proxy for "are the start anchors visible?".
const makeTarget = () =>
  ({
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
  }) as never;

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

describe("link-start anchor visibility on selection", () => {
  it("shows start anchors immediately on a fresh single selection", () => {
    const overlay = makeTarget();
    const editor = new Editor({
      host,
      mainTarget: makeTarget(),
      overlayTarget: overlay,
      initialScene: sceneWith(rect("a")),
    });
    editor.setViewportSize(800, 600);

    editor.setSelection([elementId("a")]);
    editor.forceRender();

    // Start anchors must be painted — at least one port dot (ellipse).
    expect((overlay.ellipse as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    editor.dispose();
  });

  it("keeps start anchors visible on a bare press (dragElementId set, no gesture tx)", () => {
    // `dragElementId` is set on pointerdown as a *potential* drag, in the
    // same beat as selection. A bare press must not hide the start dots.
    const overlay = makeTarget();
    const editor = new Editor({
      host,
      mainTarget: makeTarget(),
      overlayTarget: overlay,
      initialScene: sceneWith(rect("a")),
    });
    editor.setViewportSize(800, 600);
    editor.setSelection([elementId("a")]);

    // Simulate the post-pointerdown state: a press landed on the shape
    // (dragElementId set) but the user has not moved yet, so no gesture
    // transaction has opened.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor as any).dragElementId = elementId("a");
    (overlay.ellipse as ReturnType<typeof vi.fn>).mockClear();
    editor.forceRender();

    expect((overlay.ellipse as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
    editor.dispose();
  });

  it("hides start anchors during a real drag (gesture tx open)", () => {
    const overlay = makeTarget();
    const editor = new Editor({
      host,
      mainTarget: makeTarget(),
      overlayTarget: overlay,
      initialScene: sceneWith(rect("a")),
    });
    editor.setViewportSize(800, 600);
    editor.setSelection([elementId("a")]);

    // A real drag has begun — the gesture transaction is open (it opens
    // on the first move-emitted patch). Start anchors must hide.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor as any).gestureTx = { add: () => {}, commit: () => {}, cancel: () => {} };
    (overlay.ellipse as ReturnType<typeof vi.fn>).mockClear();
    editor.forceRender();

    expect((overlay.ellipse as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    editor.dispose();
  });
});
