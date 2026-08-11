/**
 * Canvas-menu backed editor APIs: per-user preferences, Unlock all, Add
 * sticky note at a point, and the document's saved start view.
 */
import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  isSticky,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { DEFAULT_EDITOR_PREFERENCES } from "../src/constants.js";

const noop = () => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;

const rect = (id: string, locked = false): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 50,
  height: 50,
  ...(locked ? { locked: true } : {}),
});

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const host = {
  addEventListener: noop,
  removeEventListener: noop,
  setPointerCapture: noop,
  releasePointerCapture: noop,
  hasPointerCapture: () => true,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
  style: { cursor: "" },
} as never;

const makeEditor = (scene: Scene, extra: Partial<ConstructorParameters<typeof Editor>[0]> = {}) =>
  new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
    ...extra,
  });

describe("preferences", () => {
  it("start from the defaults merged with the option and notify on change", () => {
    const editor = makeEditor(emptyScene(), { preferences: { wheelMode: "trackpad" } });
    expect(editor.preferences).toEqual({ ...DEFAULT_EDITOR_PREFERENCES, wheelMode: "trackpad" });
    let notified = 0;
    editor.subscribe(() => notified++);
    editor.setPreferences({ snapObjects: false });
    expect(editor.preferences.snapObjects).toBe(false);
    expect(notified).toBe(1);
    // Same values → no notification, same identity.
    const before = editor.preferences;
    editor.setPreferences({ snapObjects: false });
    expect(editor.preferences).toBe(before);
    expect(notified).toBe(1);
  });
});

describe("unlockAll", () => {
  it("clears every locked flag in one undo step", () => {
    const editor = makeEditor(sceneWith(rect("a", true), rect("b"), rect("c", true)));
    editor.unlockAll();
    for (const id of ["a", "b", "c"]) {
      expect(editor.scene.elements.get(elementId(id))?.locked).toBeUndefined();
    }
    editor.undo();
    expect(editor.scene.elements.get(elementId("a"))?.locked).toBe(true);
    expect(editor.scene.elements.get(elementId("c"))?.locked).toBe(true);
  });
});

describe("createStickyAt", () => {
  it("adds a default sticky centred on the point, selects it and opens editing", () => {
    const editor = makeEditor(emptyScene());
    const id = editor.createStickyAt({ x: 300, y: 200 });
    expect(id).not.toBeNull();
    const sticky = editor.scene.elements.get(id!)!;
    expect(isSticky(sticky)).toBe(true);
    const w = (sticky as { width: number }).width;
    expect(sticky.position).toEqual({ x: 300 - w / 2, y: 200 - w / 2 });
    expect([...editor.selection]).toEqual([id]);
    expect(editor.editingTextElement).toBe(id);
    editor.cancelTextEdit();
    editor.undo();
    expect(editor.scene.elements.size).toBe(0);
  });
});

describe("start view", () => {
  it("is set from the camera, jumped to, cleared, and applied when a scene loads", () => {
    const editor = makeEditor(emptyScene());
    expect(editor.startView).toBeNull();
    editor.panBy({ x: -100, y: -50 });
    const saved = { pan: { ...editor.scene.viewport.pan }, zoom: editor.scene.viewport.zoom };
    editor.setCurrentViewAsStart();
    expect(editor.startView).toEqual(saved);
    editor.panBy({ x: 300, y: 300 });
    expect(editor.scene.viewport.pan).not.toEqual(saved.pan);
    editor.goToStartView();
    expect(editor.scene.viewport.pan).toEqual(saved.pan);
    // A loaded document opens at its start view.
    const doc: Scene = {
      ...emptyScene(),
      viewport: { ...emptyScene().viewport, startView: { pan: { x: 7, y: 9 }, zoom: 2 } },
    };
    editor.loadScene(doc);
    expect(editor.scene.viewport.pan).toEqual({ x: 7, y: 9 });
    expect(editor.scene.viewport.zoom).toBe(2);
    editor.clearStartView();
    expect(editor.startView).toBeNull();
    expect(editor.scene.viewport.zoom).toBe(2);
  });
});

describe("setZoom", () => {
  it("sets an absolute level about the viewport centre, clamped to the zoom range", () => {
    const editor = makeEditor(emptyScene());
    editor.setViewportSize(800, 600);
    const centre = editor.screenToWorld({ x: 400, y: 300 });
    editor.setZoom(4);
    expect(editor.scene.viewport.zoom).toBe(4);
    expect(editor.screenToWorld({ x: 400, y: 300 })).toEqual(centre);
    editor.setZoom(1000);
    expect(editor.scene.viewport.zoom).toBe(32);
    editor.setZoom(0.0001);
    expect(editor.scene.viewport.zoom).toBe(0.05);
  });
});
