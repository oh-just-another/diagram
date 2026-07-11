import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("overlay memoization", () => {
  const imageEl = (id: string, animated: boolean): Element =>
    ({
      id: elementId(id),
      layerId: DEFAULT_LAYER_ID,
      type: "image",
      position: { x: 100, y: 100 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      src: "data:,",
      width: 40,
      height: 30,
      ...(animated ? { animationKind: "gif" } : {}),
    }) as unknown as Element;

  it("refreshes gif badges on a memo hit even though playback isn't in the signature", () => {
    let scene: Scene = emptyScene();
    ({ scene } = addElement(scene, imageEl("gif", true)));
    const overlayLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };
    const editor = new Editor({
      host,
      mainTarget: makeRecordingTarget({ rectCalls: [], clearCalls: [], fillCalls: 0 }),
      overlayTarget: makeRecordingTarget(overlayLog),
      initialScene: scene,
    });
    editor.setViewportSize(800, 600);

    // Pause the gif ⇒ a "play" badge is painted onto the overlay (one extra
    // fill). Nothing else is selected, so the badge is the only overlay chrome.
    editor.gifPlayback.ensure(elementId("gif"));
    editor.gifPlayback.toggle(elementId("gif"));
    expect(editor.isPlaybackPaused(elementId("gif"))).toBe(true);

    editor.lastRenderedScene = null;
    overlayLog.fillCalls = 0;
    renderEditor(buildSnapshot(editor)); // memo built with the badge
    const pausedFills = overlayLog.fillCalls;
    expect(pausedFills).toBeGreaterThan(0);

    // Resume playback via hover-enter. This mutates playback state but touches
    // NO overlay-signature field (scene / selection / hover cursor unchanged),
    // so the next paint is a memo hit — yet the badge must disappear.
    editor.gifPlayback.hoverEnter(elementId("gif"));
    expect(editor.isPlaybackPaused(elementId("gif"))).toBe(false);

    overlayLog.fillCalls = 0;
    renderEditor(buildSnapshot(editor)); // memo hit, badge recomputed away
    expect(overlayLog.fillCalls).toBeLessThan(pausedFills);

    editor.dispose();
  });

  it("overlay reflects a selection change across paints on the same target", () => {
    let scene: Scene = emptyScene();
    ({ scene } = addElement(scene, rect("a", 100, 100)));
    ({ scene } = addElement(scene, rect("b", 300, 200)));
    const overlayLog: DrawLog = { rectCalls: [], clearCalls: [], fillCalls: 0 };
    const editor = new Editor({
      host,
      mainTarget: makeRecordingTarget({ rectCalls: [], clearCalls: [], fillCalls: 0 }),
      overlayTarget: makeRecordingTarget(overlayLog),
      initialScene: scene,
    });
    editor.setViewportSize(800, 600);

    // Multi-selection draws a group bounding box + handles on the overlay.
    editor.setSelection([elementId("a"), elementId("b")]);
    editor.lastRenderedScene = null;
    renderEditor(buildSnapshot(editor));
    const withGroup = overlayLog.rectCalls.length;
    expect(withGroup).toBeGreaterThan(0);

    // Clearing the selection must invalidate the memo (selection is in the
    // signature) — the group box is gone, so the overlay paints fewer rects.
    overlayLog.rectCalls.length = 0;
    editor.setSelection([]);
    renderEditor(buildSnapshot(editor));
    expect(overlayLog.rectCalls.length).toBeLessThan(withGroup);

    editor.dispose();
  });
});

describe("per-instance animation clock (multi-instance isolation)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("each editor's snapshot clock reflects its own playback state, not a shared global", () => {
    // Pin the wall clock so both controllers advance deterministically.
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    const gifId = elementId("gif-1");
    const scene = emptyScene();
    const editorA = makeEditor(scene, { rectCalls: [], clearCalls: [], fillCalls: 0 });
    const editorB = makeEditor(scene, { rectCalls: [], clearCalls: [], fillCalls: 0 });

    // Both start playback of the same shape id at t=1000.
    editorA.gifPlayback.ensure(gifId);
    editorB.gifPlayback.ensure(gifId);

    // Advance, then freeze the GIF in editor A only.
    now = 1500;
    editorA.togglePlayback(gifId); // pause A → frozen at 500

    now = 3000;
    const shape = { id: "gif-1" };
    const clockA = buildSnapshot(editorA).animationClock;
    const clockB = buildSnapshot(editorB).animationClock;

    // A is frozen (500); B keeps running (3000 - 1000 = 2000). Two editors on
    // one page therefore drive independent playback — no shared-global leak.
    expect(clockA(shape)).toBe(500);
    expect(clockB(shape)).toBe(2000);

    editorA.dispose();
    editorB.dispose();
  });
});
