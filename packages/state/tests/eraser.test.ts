import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  orderBetween,
  emptyScene,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

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

const makeEditor = (scene: Scene): Editor =>
  new Editor({
    host: {
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
      style: {},
    } as never,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

describe("eraser tool", () => {
  it("sweeps shapes along the drag into a pending set and deletes them on release", () => {
    // Two rects on a horizontal row; a third far away, off the path.
    const a = rect("a", 0, 0); // covers 0..40
    const b = rect("b", 100, 0); // covers 100..140
    const far = rect("far", 0, 300); // way below the sweep line
    const editor = makeEditor(sceneWith(a, b, far));
    editor.setMode("erase");

    // Drag from inside `a` to inside `b` along y≈20.
    editor.beginEraseStroke({ x: 20, y: 20 });
    editor.extendEraseStroke({ x: 120, y: 20 });

    // Both swept shapes are pending; the off-path shape is not.
    expect([...editor.pendingErase].sort()).toEqual(["a", "b"]);
    // Nothing deleted yet (preview only).
    expect(editor.scene.elements.size).toBe(3);

    const removed = editor.commitEraseStroke();
    expect(removed).toBe(2);
    expect(editor.scene.elements.has(elementId("a"))).toBe(false);
    expect(editor.scene.elements.has(elementId("b"))).toBe(false);
    expect(editor.scene.elements.has(elementId("far"))).toBe(true);
    expect(editor.pendingErase.size).toBe(0);
  });

  it("deletes an entire stroke in ONE undo step (undo restores every shape)", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0), rect("b", 100, 0)));
    editor.setMode("erase");
    editor.beginEraseStroke({ x: 20, y: 20 });
    editor.extendEraseStroke({ x: 120, y: 20 });
    editor.commitEraseStroke();
    expect(editor.scene.elements.size).toBe(0);

    // A single undo brings back BOTH shapes (one transaction).
    editor.undo();
    expect(editor.scene.elements.size).toBe(2);
    expect(editor.scene.elements.has(elementId("a"))).toBe(true);
    expect(editor.scene.elements.has(elementId("b"))).toBe(true);
  });

  it("does not touch shapes outside the eraser path", () => {
    const editor = makeEditor(sceneWith(rect("hit", 0, 0), rect("miss", 200, 200)));
    editor.setMode("erase");
    editor.beginEraseStroke({ x: 20, y: 20 });
    editor.extendEraseStroke({ x: 30, y: 25 });
    editor.commitEraseStroke();
    expect(editor.scene.elements.has(elementId("hit"))).toBe(false);
    expect(editor.scene.elements.has(elementId("miss"))).toBe(true);
  });

  it("cancel aborts the stroke without deleting", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0)));
    editor.setMode("erase");
    editor.beginEraseStroke({ x: 20, y: 20 });
    expect(editor.pendingErase.size).toBe(1);
    editor.cancelEraseStroke();
    expect(editor.eraseStroke).toBeNull();
    expect(editor.scene.elements.size).toBe(1);
  });

  it("Alt (restore) un-marks a shape wiggled back over, so it survives the commit", () => {
    // `a` at x0..40, `b` far right at x200..240 — a restore wiggle inside `b`
    // can rescue it without touching `a`.
    const editor = makeEditor(sceneWith(rect("a", 0, 0), rect("b", 200, 0)));
    editor.setMode("erase");
    editor.beginEraseStroke({ x: 20, y: 20 }); // seeds `a`
    editor.extendEraseStroke({ x: 220, y: 20 }); // sweeps across to `b` — both marked
    expect([...editor.pendingErase].sort()).toEqual(["a", "b"]);
    // Small Alt-held wiggle staying inside `b` → `b` rescued, `a` untouched.
    editor.extendEraseStroke({ x: 215, y: 20 }, true);
    expect([...editor.pendingErase]).toEqual(["a"]);
    editor.commitEraseStroke();
    expect(editor.scene.elements.has(elementId("a"))).toBe(false); // still marked → deleted
    expect(editor.scene.elements.has(elementId("b"))).toBe(true); // rescued → survived
  });

  it("beginning the stroke with restore (Alt) seeds nothing under the press", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0)));
    editor.setMode("erase");
    editor.beginEraseStroke({ x: 20, y: 20 }, true);
    // Alt at press = un-mark mode; there's nothing marked yet, so no seed.
    expect(editor.pendingErase.size).toBe(0);
  });

  it("forces a full repaint while erasing so the marked dim actually paints", () => {
    // Marking a shape for erase re-dims it WITHOUT mutating the scene, so the
    // scene-diff dirty rect is empty (renderScene would cull everything and the
    // dim would never paint). An active eraser must force a full repaint.
    const editor = makeEditor(sceneWith(rect("a", 0, 0)));
    editor.setMode("erase");
    editor.setViewportSize(500, 500);
    const ed = editor as unknown as {
      lastRenderedScene: Scene | null;
      computeDirtyWorld(): unknown;
    };
    // Pretend we just painted this exact scene (prev === next → empty diff).
    ed.lastRenderedScene = editor.scene;
    // No eraser yet: unchanged scene → a non-null empty dirty rect (cull all).
    expect(ed.computeDirtyWorld()).not.toBeNull();
    // Erasing (scene still unchanged) → null = full repaint, so the dim shows.
    editor.beginEraseStroke({ x: 20, y: 20 });
    expect(ed.computeDirtyWorld()).toBeNull();
  });

  it("forces a repaint when the eraser is cancelled so the dim doesn't linger", () => {
    // Esc-cancel un-marks the shapes without a scene change; without a forced
    // repaint on that active→inactive transition the dim would stick on screen.
    const editor = makeEditor(sceneWith(rect("a", 0, 0)));
    editor.setMode("erase");
    editor.setViewportSize(500, 500);
    const ed = editor as unknown as {
      lastRenderedScene: Scene | null;
      lastRenderedEraseActive: boolean;
      computeDirtyWorld(): unknown;
    };
    ed.lastRenderedScene = editor.scene;
    // Simulate that the previous frame painted the erase dim.
    ed.lastRenderedEraseActive = true;
    // Cancel: stroke gone, scene unchanged — must still force a full repaint.
    editor.cancelEraseStroke();
    expect(ed.computeDirtyWorld()).toBeNull();
    // A subsequent idle frame (dim already cleared) is back to normal culling.
    ed.lastRenderedEraseActive = false;
    expect(ed.computeDirtyWorld()).not.toBeNull();
  });

  it("flags eraseActive on the render snapshot only while shapes are marked", () => {
    const editor = makeEditor(sceneWith(rect("a", 0, 0)));
    editor.setMode("erase");
    const snap = () =>
      (
        editor as unknown as { buildRenderSnapshot(): { eraseActive: boolean } }
      ).buildRenderSnapshot().eraseActive;
    expect(snap()).toBe(false);
    editor.beginEraseStroke({ x: 20, y: 20 }); // seeds `a` → marked
    expect(snap()).toBe(true);
    editor.cancelEraseStroke();
    expect(snap()).toBe(false);
  });
});
