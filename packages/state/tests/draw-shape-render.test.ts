import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyScene } from "@oh-just-another/scene";
import { installBuiltinRenderers } from "@oh-just-another/renderer-core";
import { Editor } from "../src/editor.js";

// Per-shape renderers must be registered or renderScene draws nothing.
installBuiltinRenderers();

// Controlled requestAnimationFrame so we can mimic the browser's render
// coalescing (many scheduleRender() calls during one event → one paint).
let rafQueue: FrameRequestCallback[] = [];
let rafId = 0;
const flushRAF = () => {
  for (let i = 0; i < 20 && rafQueue.length > 0; i++) {
    const batch = rafQueue;
    rafQueue = [];
    for (const cb of batch) cb(performance.now());
  }
};

beforeEach(() => {
  rafQueue = [];
  rafId = 0;
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
    cb: FrameRequestCallback,
  ) => {
    rafQueue.push(cb);
    return ++rafId;
  };
  (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = () => {};
});

afterEach(() => {
  delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
});

const recordingTarget = () => {
  let rects = 0;
  const t = {
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
    rect: () => {
      rects += 1;
    },
    ellipse: () => {
      rects += 1;
    },
    fill: () => {},
    stroke: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }),
    drawImage: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    resetTransform: () => {},
    size: { width: 800, height: 600 },
  };
  return { target: t as never, count: () => rects, reset: () => (rects = 0) };
};

const ev = (type: string, x: number, y: number) => ({
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

describe("draw-shape commit render", () => {
  it("paints the new shape on the main layer at mouse-up (no pan needed)", () => {
    const handlers = new Map<string, (e: unknown) => void>();
    const host = {
      addEventListener: (t: string, fn: (e: unknown) => void) => handlers.set(t, fn),
      removeEventListener: (t: string) => handlers.delete(t),
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      hasPointerCapture: () => true,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      style: { cursor: "" },
    } as never;
    const main = recordingTarget();
    const overlay = recordingTarget();
    const editor = new Editor({
      host,
      mainTarget: main.target,
      overlayTarget: overlay.target,
      initialScene: emptyScene(),
    });
    editor.setMode("draw-rect");
    flushRAF();

    const down = (x: number, y: number) => handlers.get("pointerdown")!(ev("pointerdown", x, y));
    const move = (x: number, y: number) => handlers.get("pointermove")!(ev("pointermove", x, y));
    const up = (x: number, y: number) => handlers.get("pointerup")!(ev("pointerup", x, y));

    down(50, 50);
    move(150, 120);
    flushRAF();

    main.reset();
    up(150, 120);
    flushRAF();

    expect([...editor.scene.elements.values()].length).toBe(1);
    // The shape must be drawn on the MAIN layer this frame — without a pan.
    expect(main.count()).toBeGreaterThan(0);
  });

  it("onAfterRender (surface present) runs AFTER the frame is painted", () => {
    // present() runs after the rAF render so deferred surfaces (WebGL2 /
    // OffscreenCanvas) present the same frame they were painted in.
    const handlers = new Map<string, (e: unknown) => void>();
    const host = {
      addEventListener: (t: string, fn: (e: unknown) => void) => handlers.set(t, fn),
      removeEventListener: (t: string) => handlers.delete(t),
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      hasPointerCapture: () => true,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      style: { cursor: "" },
    } as never;
    const timeline: string[] = [];
    const mk = () => {
      const base = recordingTarget();
      const t = base.target as unknown as { rect: () => void };
      const origRect = t.rect;
      t.rect = () => {
        timeline.push("paint");
        origRect();
      };
      return base;
    };
    const main = mk();
    const editor = new Editor({
      host,
      mainTarget: main.target,
      overlayTarget: recordingTarget().target,
      onAfterRender: () => timeline.push("present"),
      initialScene: emptyScene(),
    });
    editor.setMode("draw-rect");
    flushRAF();

    timeline.length = 0;
    handlers.get("pointerdown")!(ev("pointerdown", 50, 50));
    handlers.get("pointermove")!(ev("pointermove", 150, 120));
    handlers.get("pointerup")!(ev("pointerup", 150, 120));
    flushRAF();

    // present must come after at least one paint, and be the last thing
    // each frame — never before the paint.
    expect(timeline).toContain("present");
    expect(timeline).toContain("paint");
    expect(timeline.indexOf("paint")).toBeLessThan(timeline.lastIndexOf("present"));
    expect(timeline[timeline.length - 1]).toBe("present");
  });
});
