import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import { DEFAULT_LAYER_ID, addElement, emptyScene, orderBetween, type Element } from "@oh-just-another/scene";
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

const rect = (id: string, x: number, y: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000", stroke: "#000" },
  width: 40,
  height: 40,
});

// Records line segments (moveTo→lineTo) drawn in WORLD coords (renderScene
// applies the transform via setTransform, so the args are world here).
const recordingTarget = () => {
  const segs: { x0: number; y0: number; x1: number; y1: number }[] = [];
  let cx = 0;
  let cy = 0;
  const t = {
    save: () => {}, restore: () => {}, setTransform: () => {}, clear: () => {},
    setFill: () => {}, setStroke: () => {}, setStrokeWidth: () => {},
    setOpacity: () => {}, setLineCap: () => {}, setLineJoin: () => {},
    setDashArray: () => {}, setFont: () => {}, setTextAlign: () => {},
    setTextBaseline: () => {}, beginPath: () => {}, closePath: () => {},
    moveTo: (x: number, y: number) => {
      cx = x;
      cy = y;
    },
    lineTo: (x: number, y: number) => {
      segs.push({ x0: cx, y0: cy, x1: x, y1: y });
      cx = x;
      cy = y;
    },
    quadraticCurveTo: () => {}, bezierCurveTo: () => {}, rect: () => {}, ellipse: () => {},
    fill: () => {}, stroke: () => {}, fillText: () => {},
    measureText: () => ({ width: 0 }), drawImage: () => {},
    translate: () => {}, rotate: () => {}, scale: () => {},
    resetTransform: () => {}, size: { width: 800, height: 600 },
  };
  return { target: t as never, segs };
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

// Is there a horizontal segment at y≈20 spanning x in [40,80] — i.e. the
// connector between A (right edge x=40) and the created copy (left edge x≈80)?
const hasConnector = (segs: { x0: number; y0: number; x1: number; y1: number }[]) =>
  segs.some(
    (s) =>
      Math.abs(s.y0 - 20) < 2 &&
      Math.abs(s.y1 - 20) < 2 &&
      Math.min(s.x0, s.x1) <= 45 &&
      Math.max(s.x0, s.x1) >= 75,
  );

describe("click a start dot to create a copy — connector renders immediately", () => {
  it("draws the connector on the same frame (no element move needed)", () => {
    const handlers = new Map<string, (e: unknown) => void>();
    const main = recordingTarget();
    let s = emptyScene();
    s = addElement(s, rect("a", 0, 0)).scene;
    const editor = new Editor({
      host: host(handlers), mainTarget: main.target, overlayTarget: recordingTarget().target,
      initialScene: s,
    });
    editor.setViewportSize(800, 600);
    flushRAF();

    const down = (x: number, y: number) => handlers.get("pointerdown")!(ev("pointerdown", x, y));
    const up = (x: number, y: number) => handlers.get("pointerup")!(ev("pointerup", x, y));

    down(20, 20); up(20, 20); // select A
    flushRAF();

    main.segs.length = 0;
    down(48, 20); up(48, 20); // click A's right dot → create copy + connector
    flushRAF();

    expect([...editor.scene.links.values()].length).toBe(1); // link created
    expect(hasConnector(main.segs)).toBe(true); // …and drawn this frame
  });
});
