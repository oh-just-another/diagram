import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyScene } from "@oh-just-another/scene";
import { installBuiltinRenderers } from "@oh-just-another/renderer-core";
import { Editor } from "../src/editor.js";

installBuiltinRenderers();

let rafQueue: FrameRequestCallback[] = [];
const flushRAF = () => {
  for (let i = 0; i < 20 && rafQueue.length > 0; i++) {
    const batch = rafQueue;
    rafQueue = [];
    for (const cb of batch) cb(performance.now());
  }
};
beforeEach(() => {
  rafQueue = [];
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return 1;
  };
  (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = () => {};
});
afterEach(() => {
  delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
});

// Records ellipse + dashed-rect primitives in WORLD coords. Shapes draw in
// local space after a per-shape translate, so the recorded primitive is
// shifted back into world by the tracked translate.
const recordingTarget = () => {
  const ellipses: { x: number; y: number; rx: number; ry: number }[] = [];
  const dashedRects: { x: number; y: number; w: number; h: number }[] = [];
  let tx = 0;
  let ty = 0;
  let dashed = false;
  const t = {
    save: () => {}, restore: () => {},
    setTransform: () => { tx = 0; ty = 0; }, clear: () => {},
    setFill: () => {}, setStroke: () => {}, setStrokeWidth: () => {},
    setOpacity: () => {}, setLineCap: () => {}, setLineJoin: () => {},
    setDashArray: (d: readonly number[] | null) => { dashed = d !== null && d.length > 0; },
    setFont: () => {}, setTextAlign: () => {}, setTextBaseline: () => {},
    beginPath: () => {}, closePath: () => {},
    moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, bezierCurveTo: () => {},
    rect: (x: number, y: number, w: number, h: number) => {
      if (dashed) dashedRects.push({ x: x + tx, y: y + ty, w, h });
    },
    ellipse: (x: number, y: number, rx: number, ry: number) =>
      ellipses.push({ x: x + tx, y: y + ty, rx, ry }),
    fill: () => {}, stroke: () => {}, fillText: () => {},
    measureText: () => ({ width: 0 }), drawImage: () => {},
    translate: (x: number, y: number) => { tx += x; ty += y; },
    rotate: () => {}, scale: () => {},
    resetTransform: () => { tx = 0; ty = 0; }, size: { width: 800, height: 600 },
  };
  return { target: t as never, ellipses, dashedRects };
};

const host = (handlers: Map<string, (e: unknown) => void>) =>
  ({
    addEventListener: (t: string, fn: (e: unknown) => void) => handlers.set(t, fn),
    removeEventListener: () => {}, setPointerCapture: () => {}, releasePointerCapture: () => {},
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: { cursor: "" },
  }) as never;

const ev = (type: string, x: number, y: number) => ({
  type, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", button: 0,
  buttons: type === "pointerup" ? 0 : 1,
  shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
  timeStamp: 0, preventDefault: () => {},
});

describe("draw-by-drag shows a WYSIWYG shape preview (not just a dashed box)", () => {
  it("draw-ellipse drag renders the actual ellipse during the gesture", () => {
    const handlers = new Map<string, (e: unknown) => void>();
    const overlay = recordingTarget();
    const editor = new Editor({
      host: host(handlers), mainTarget: recordingTarget().target, overlayTarget: overlay.target,
      initialScene: emptyScene(),
    });
    editor.setViewportSize(800, 600);
    editor.setMode("draw-ellipse");
    flushRAF();

    overlay.ellipses.length = 0;
    overlay.dashedRects.length = 0;

    handlers.get("pointerdown")!(ev("pointerdown", 10, 10));
    handlers.get("pointermove")!(ev("pointermove", 60, 50)); // drag out a 50×40 box
    flushRAF();

    // A real ellipse is previewed at the dragged bounds (centre 35,30; rx 25, ry 20)…
    expect(
      overlay.ellipses.some(
        (e) => Math.abs(e.rx - 25) < 2 && Math.abs(e.ry - 20) < 2,
      ),
    ).toBe(true);
    // …and the plain dashed rubber-band rect is not used for the shape draw.
    expect(overlay.dashedRects.length).toBe(0);
  });
});
