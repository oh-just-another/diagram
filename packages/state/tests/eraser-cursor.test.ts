import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { ERASER_TRAIL_TTL_MS, LASER_TRAIL_TTL_MS } from "../src/constants.js";
import type { RenderSnapshot } from "../src/editor/render-orchestrator.js";

const rect = (id: string, x: number, y: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 40,
  height: 40,
});

const noopTarget = {
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
  bezierCurveTo: () => {},
  quadraticCurveTo: () => {},
  rect: () => {},
  ellipse: () => {},
  fill: () => {},
  stroke: () => {},
  fillText: () => {},
  measureText: () => ({ width: 0 }),
  drawImage: () => {},
  drawPoint: () => {},
  scale: () => {},
  translate: () => {},
  rotate: () => {},
} as never;

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const makeEditor = (scene: Scene, opts: { readOnly?: boolean } = {}): Editor =>
  new Editor({
    host: {
      addEventListener: () => {},
      removeEventListener: () => {},
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      hasPointerCapture: () => true,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
      style: { cursor: "" },
    } as never,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
    ...(opts.readOnly !== undefined ? { readOnly: opts.readOnly } : {}),
  });

/** Reach the private snapshot builder without widening the public API. */
const snapshot = (editor: Editor): RenderSnapshot =>
  (editor as unknown as { buildRenderSnapshot(): RenderSnapshot }).buildRenderSnapshot();

const cursorOf = (e: Editor): string =>
  (e as unknown as { host: { style: { cursor: string } } }).host.style.cursor;

describe("eraser cursor ring (snapshot)", () => {
  it("is null in select mode", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0)));
    editor.lastPointerWorld = { x: 20, y: 20 };
    expect(snapshot(editor).eraserCursor).toBeNull();
  });

  it("is null when read-only, even in erase mode with a hover point", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0)), { readOnly: true });
    editor.setMode("erase");
    editor.lastPointerWorld = { x: 20, y: 20 };
    expect(snapshot(editor).eraserCursor).toBeNull();
  });

  it("is null in erase mode when there is no hover point", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0)));
    editor.setMode("erase");
    editor.lastPointerWorld = null;
    expect(snapshot(editor).eraserCursor).toBeNull();
  });

  it("is {center, radius=brushSettings.width} in erase mode with a hover point", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0)));
    editor.setMode("erase");
    editor.lastPointerWorld = { x: 20, y: 30 };
    const c = snapshot(editor).eraserCursor;
    expect(c).not.toBeNull();
    expect(c?.center).toEqual({ x: 20, y: 30 });
    expect(c?.radius).toBe(editor.brushSettings.width);
  });

  it("radius tracks the panel eraser size (setBrushSettings)", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0)));
    editor.setMode("erase");
    editor.lastPointerWorld = { x: 0, y: 0 };
    editor.setBrushSettings({ width: 37 });
    expect(snapshot(editor).eraserCursor?.radius).toBe(37);
    editor.setBrushSettings({ width: 12 });
    expect(snapshot(editor).eraserCursor?.radius).toBe(12);
  });
});

describe("eraser cursor (CSS)", () => {
  it("hides the OS cursor in erase mode", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0)));
    editor.setMode("erase");
    expect(cursorOf(editor)).toBe("none");
  });
});

describe("eraser drag trail", () => {
  // The editor stamps trail points with `performance.now()`; drive it deterministically.
  let clock = 0;
  beforeEach(() => {
    clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("grows a fading trail while the eraser is dragged", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0)));
    editor.setMode("erase");
    editor.beginEraseStroke({ x: 0, y: 0 });
    editor.extendEraseStroke({ x: 10, y: 10 });
    expect(editor.eraserTrail.length).toBe(1);
    expect(editor.eraserTrail[0]?.points.length).toBeGreaterThanOrEqual(2);
    expect(editor.hasActiveLaser()).toBe(true);
  });

  it("keeps the trail (fading) after commit but stops growing it", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0)));
    editor.setMode("erase");
    editor.beginEraseStroke({ x: 0, y: 0 });
    editor.extendEraseStroke({ x: 10, y: 10 });
    const lenBefore = editor.eraserTrail[0]?.points.length ?? 0;
    editor.commitEraseStroke();
    // Trail survives the commit (it fades on its own timeline) …
    expect(editor.eraserTrail.length).toBe(1);
    // … and a stray extend after commit does not grow it (no active stroke).
    editor.extendEraseStroke({ x: 999, y: 999 });
    expect(editor.eraserTrail[0]?.points.length).toBe(lenBefore);
  });

  it("prunes the trail at the eraser's OWN (short) TTL, not the laser's", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0)));
    editor.setMode("erase");
    editor.beginEraseStroke({ x: 0, y: 0 });
    editor.extendEraseStroke({ x: 10, y: 10 });
    editor.commitEraseStroke();
    expect(editor.hasActiveLaser()).toBe(true);
    // The eraser TTL is much shorter than the laser's — advancing just past it
    // (still far below LASER_TRAIL_TTL_MS) must already empty the trail.
    expect(ERASER_TRAIL_TTL_MS).toBeLessThan(LASER_TRAIL_TTL_MS);
    clock = ERASER_TRAIL_TTL_MS + 10;
    editor.forceRender();
    expect(editor.eraserTrail.length).toBe(0);
    expect(editor.hasActiveLaser()).toBe(false);
  });
});
