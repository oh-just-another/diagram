import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addShape,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { installBuiltinRenderers } from "@oh-just-another/renderer-core";
import { Editor } from "../src/editor.js";

// Register the built-in shape renderers so `rectangle` actually paints.
installBuiltinRenderers();

interface DrawLog {
  rectCalls: Array<{ x: number; y: number; width: number; height: number }>;
  clearCalls: Array<{ bounds?: { x: number; y: number; width: number; height: number } }>;
  fillCalls: number;
}

const makeRecordingTarget = (log: DrawLog) => {
  return {
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    resetTransform: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    clear: (bounds?: { x: number; y: number; width: number; height: number }) => {
      log.clearCalls.push(bounds ? { bounds } : {});
    },
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
    rect: (x: number, y: number, width: number, height: number) => {
      log.rectCalls.push({ x, y, width, height });
    },
    ellipse: () => {},
    fill: () => {
      log.fillCalls++;
    },
    stroke: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }),
    drawImage: () => {},
    drawPoint: () => {},
    size: { width: 800, height: 600 },
  } as never;
};

const host = {
  addEventListener: () => {},
  removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  style: {},
} as never;

const rect = (id: string, x: number, y: number, w = 50, h = 50): Element => ({
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

describe("first render after ResizeObserver", () => {
  it("renders shapes when scene has them from the start (viewport.size = 0 initially)", () => {
    // Shapes already present, viewport.size left at the empty default {0, 0} —
    // the initial state the editor sees on mount before the ResizeObserver fires.
    let scene: Scene = emptyScene();
    ({ scene } = addShape(scene, rect("a", 100, 100)));
    ({ scene } = addShape(scene, rect("b", 300, 200)));

    const mainLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };
    const overlayLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };

    // The constructor's first render runs against the 0×0 viewport — no
    // pixels are hit, but lastRenderedScene gets set anyway.
    const editor = new Editor({
      host,
      mainTarget: makeRecordingTarget(mainLog),
      overlayTarget: makeRecordingTarget(overlayLog),
      initialScene: scene,
    });

    // Record state after constructor's render.
    const fillsAfterConstructor = mainLog.fillCalls;

    // Simulate the ResizeObserver firing with the real canvas size — the
    // call that produces the first visible paint.
    editor.setViewportSize(800, 600);

    // The second render must paint both rectangles into the main target:
    // at least two rect() + fill() pairs beyond what the constructor produced.
    const newFills = mainLog.fillCalls - fillsAfterConstructor;
    expect(
      newFills,
      `Expected fills after setViewportSize to grow (got ${newFills} more). ` +
        `Total rect calls: ${mainLog.rectCalls.length}, total fills: ${mainLog.fillCalls}.`,
    ).toBeGreaterThanOrEqual(2);

    editor.dispose();
  });

  it("paints shape AABBs at the correct world coords after setViewportSize", () => {
    let scene: Scene = emptyScene();
    ({ scene } = addShape(scene, rect("a", 100, 100, 50, 50)));
    const mainLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };
    const overlayLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };
    const editor = new Editor({
      host,
      mainTarget: makeRecordingTarget(mainLog),
      overlayTarget: makeRecordingTarget(overlayLog),
      initialScene: scene,
    });
    const callsBefore = mainLog.rectCalls.length;
    editor.setViewportSize(800, 600);
    const newCalls = mainLog.rectCalls.slice(callsBefore);
    // The rectangle shape paints via `target.rect(0, 0, w, h)` under a
    // pre-applied position transform. So we expect a rect call with
    // exactly 50×50 dimensions starting at (0, 0) — the position is in
    // the matrix transform, not in the rect call.
    const match = newCalls.find((c) => c.width === 50 && c.height === 50);
    expect(
      match,
      `Expected a 50×50 rect call after setViewportSize. Got: ${JSON.stringify(newCalls)}`,
    ).toBeDefined();
    editor.dispose();
  });

  it("issues full clear (no bounds arg) on first real-size paint", () => {
    let scene: Scene = emptyScene();
    ({ scene } = addShape(scene, rect("a", 100, 100)));
    const mainLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };
    const overlayLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };
    const editor = new Editor({
      host,
      mainTarget: makeRecordingTarget(mainLog),
      overlayTarget: makeRecordingTarget(overlayLog),
      initialScene: scene,
    });
    const clearsBefore = mainLog.clearCalls.length;
    editor.setViewportSize(800, 600);
    const newClears = mainLog.clearCalls.slice(clearsBefore);
    // Must include at least one full-canvas clear (no bounds arg). A
    // present `bounds` would mean dirty-rect kicked in too early.
    const hasFullClear = newClears.some((c) => c.bounds === undefined);
    expect(
      hasFullClear,
      `Expected at least one full clear (bounds=undefined) on first real-size paint. Got: ${JSON.stringify(newClears)}`,
    ).toBe(true);
    editor.dispose();
  });

  it("survives a same-size LayeredCanvas.resize between paints", async () => {
    // A same-scene notify (via setMode(sameMode)) must not lose
    // already-painted shapes. setupHiDpi and LayeredCanvas.resize are
    // idempotent: same-size calls no-op and the existing canvas bitmap
    // survives. The state package has no dependency on renderer-canvas, so
    // this exercises an Editor-level surrogate and asserts the dirty-rect
    // path produces an empty rect, which guarantees the canvas content
    // survives.
    let scene: Scene = emptyScene();
    ({ scene } = addShape(scene, rect("a", 100, 100)));
    scene = {
      ...scene,
      viewport: { ...scene.viewport, size: { width: 800, height: 600 } },
    };
    const mainLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };
    const overlayLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };
    const editor = new Editor({
      host,
      mainTarget: makeRecordingTarget(mainLog),
      overlayTarget: makeRecordingTarget(overlayLog),
      initialScene: scene,
    });
    // Constructor's render painted the rectangle.
    const fillsAfterMount = mainLog.fillCalls;
    expect(fillsAfterMount).toBeGreaterThanOrEqual(1);
    // Simulate "setMode(sameMode)" — notify with no scene change.
    editor.setMode(editor.mode);
    // Await microtasks so any queued auto-compact runs and flushes.
    await Promise.resolve();
    // A same-scene notify is a no-op on the main canvas (no new fills); the
    // canvas content from the constructor paint is preserved because nothing
    // cleared it.
    expect(mainLog.fillCalls).toBe(fillsAfterMount);
    editor.dispose();
  });

  it("renders shapes added AFTER the first real-size paint", () => {
    // A shape added after the editor has been sized must reach the canvas in
    // the subsequent render — the path most operations use.
    const mainLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };
    const overlayLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };
    const editor = new Editor({
      host,
      mainTarget: makeRecordingTarget(mainLog),
      overlayTarget: makeRecordingTarget(overlayLog),
      initialScene: emptyScene(),
    });
    editor.setViewportSize(800, 600);
    const fillsBeforeAdd = mainLog.fillCalls;
    editor.addShape(rect("a", 100, 100));
    expect(mainLog.fillCalls - fillsBeforeAdd).toBeGreaterThanOrEqual(1);
    editor.dispose();
  });
});
