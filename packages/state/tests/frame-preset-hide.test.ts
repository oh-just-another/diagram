/**
 * Frame toolbar features: size presets resize the frame in place, and
 * hiding a frame takes its members with it (render hide-set + hit-test)
 * until the frames panel unhides it.
 */
import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  isElementHidden,
  orderBetween,
  type Element,
  type FrameElement,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { FRAME_SIZE_PRESETS } from "../src/constants.js";

const frame = (id: string): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "frame",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    width: 300,
    height: 200,
  }) as unknown as Element;

const rect = (id: string, frameId?: string): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "rectangle",
    position: { x: 10, y: 10 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    width: 50,
    height: 50,
    ...(frameId !== undefined ? { frameId: elementId(frameId) } : {}),
  }) as unknown as Element;

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

const noop = () => undefined;
const targetBase: Record<string, unknown> = { measureText: () => ({ width: 0 }) };
const noopTarget = new Proxy(targetBase, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;
const makeHost = () =>
  ({
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    hasPointerCapture: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: { cursor: "" },
  }) as never;

const editorWith = (scene: Scene): Editor =>
  new Editor({
    host: makeHost(),
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

describe("applyFramePreset", () => {
  it("resizes the frame to the preset, keeps the corner and is undoable", () => {
    const e = editorWith(sceneWith(frame("f")));
    const preset = FRAME_SIZE_PRESETS.find((p) => p.id === "16:9")!;
    e.applyFramePreset(elementId("f"), preset);
    const after = e.scene.elements.get(elementId("f")) as FrameElement;
    expect(after.width).toBe(preset.width);
    expect(after.height).toBe(preset.height);
    expect(after.position).toEqual({ x: 0, y: 0 });
    e.undo();
    expect((e.scene.elements.get(elementId("f")) as FrameElement).width).toBe(300);
  });

  it("ignores non-frames", () => {
    const e = editorWith(sceneWith(rect("r")));
    e.applyFramePreset(elementId("r"), FRAME_SIZE_PRESETS[0]!);
    expect((e.scene.elements.get(elementId("r")) as { width: number }).width).toBe(50);
  });
});

describe("toggleFrameHidden", () => {
  it("hides the frame together with its members and clears the selection", () => {
    const e = editorWith(sceneWith(frame("f"), rect("m", "f"), rect("free")));
    e.setSelection([elementId("f")]);
    e.toggleFrameHidden(elementId("f"));
    const scene = e.scene;
    expect(isElementHidden(scene, scene.elements.get(elementId("f"))!)).toBe(true);
    expect(isElementHidden(scene, scene.elements.get(elementId("m"))!)).toBe(true);
    expect(isElementHidden(scene, scene.elements.get(elementId("free"))!)).toBe(false);
    expect(e.selection.size).toBe(0);
    // The render hide-set picks all of it up.
    expect([...(e.computeHiddenElements() ?? [])].sort()).toEqual([elementId("f"), elementId("m")]);
    // Hidden = click-through: the press lands on the visible shape
    // beneath, skipping both the frame and its hidden member.
    expect(e.hitTest({ x: 20, y: 20 })).toMatchObject({
      kind: "element",
      id: elementId("free"),
    });
    // Toggle back.
    e.toggleFrameHidden(elementId("f"));
    expect(isElementHidden(e.scene, e.scene.elements.get(elementId("m"))!)).toBe(false);
  });
});
