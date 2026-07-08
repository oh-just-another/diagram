import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { installBuiltinRenderers } from "@oh-just-another/renderer-core";
import { Editor } from "../src/editor.js";
import { renderEditor, type RenderSnapshot } from "../src/editor/render-orchestrator.js";

installBuiltinRenderers();

interface DrawLog {
  rectCalls: Array<{ x: number; y: number; width: number; height: number }>;
  clearCalls: Array<{ bounds?: { x: number; y: number; width: number; height: number } }>;
  fillCalls: number;
}

const makeRecordingTarget = (log: DrawLog) =>
  ({
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
  }) as never;

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

/** Reach the private snapshot builder without widening the public API. */
const buildSnapshot = (editor: Editor): RenderSnapshot =>
  (editor as unknown as { buildRenderSnapshot(): RenderSnapshot }).buildRenderSnapshot();

const makeEditor = (scene: Scene, mainLog: DrawLog) => {
  const overlayLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };
  const editor = new Editor({
    host,
    mainTarget: makeRecordingTarget(mainLog),
    overlayTarget: makeRecordingTarget(overlayLog),
    initialScene: scene,
  });
  editor.setViewportSize(800, 600);
  return editor;
};

describe("RenderSnapshot", () => {
  it("Editor builds a snapshot that mirrors its current render state", () => {
    let scene: Scene = emptyScene();
    ({ scene } = addElement(scene, rect("a", 100, 100)));
    ({ scene } = addElement(scene, rect("b", 300, 200)));
    const mainLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };
    const editor = makeEditor(scene, mainLog);
    editor.setSelection([elementId("a")]);

    const snap = buildSnapshot(editor);

    // Scene / selection reference the editor's live state.
    expect(snap.scene).toBe(editor.scene);
    expect([...snap.selection]).toEqual([elementId("a")]);
    // Derived viewport rect is resolved up front (non-null once sized).
    expect(snap.viewportWorld).not.toBeNull();
    // Targets are wired straight through.
    expect(typeof snap.mainTarget.clear).toBe("function");
    // Callbacks are live, not stubbed.
    expect(typeof snap.previewClickCreate).toBe("function");
    expect(typeof snap.isPlaybackPaused).toBe("function");
    expect(snap.isPlaybackPaused(elementId("a"))).toBe(false);

    editor.dispose();
  });

  it("renderEditor paints a supplied snapshot", () => {
    let scene: Scene = emptyScene();
    ({ scene } = addElement(scene, rect("a", 100, 100)));
    const mainLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };
    const editor = makeEditor(scene, mainLog);

    // Force a full repaint (null `lastRenderedScene` ⇒ `dirtyWorld` null, so
    // the dirty-rect cull doesn't skip the unchanged scene), reset the log,
    // then paint an independently-built snapshot: renderEditor consumes the
    // flat snapshot (no Editor coupling) and hits the main target.
    editor.lastRenderedScene = null;
    mainLog.rectCalls.length = 0;
    mainLog.fillCalls = 0;
    const snap = buildSnapshot(editor);
    renderEditor(snap);

    expect(mainLog.rectCalls.some((c) => c.width === 50 && c.height === 50)).toBe(true);
    expect(mainLog.fillCalls).toBeGreaterThanOrEqual(1);

    editor.dispose();
  });
});
