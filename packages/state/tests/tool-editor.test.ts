import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  getElement,
  isEllipse,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

// Editor-level integration for the F8–F11 tool commands: eyedropper apply,
// convert-type, image-crop session (begin / drag / commit / cancel) and
// connected-node spawn. Exercised against a headless Editor with a noop host.

const rect = (id: string, x = 0, y = 0, style: Element["style"] = {}): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style,
  width: 60,
  height: 40,
});

const image = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "image",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  src: "data:,",
  width: 100,
  height: 80,
});

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

describe("Editor.applyEyedropperAt (F8)", () => {
  it("applies the sampled fill to the current selection", () => {
    const e = editorWith(sceneWith(rect("src", 0, 0, { fill: "#123456" }), rect("dst", 200, 0)));
    e.setSelection([elementId("dst")]);
    const color = e.applyEyedropperAt({ x: 10, y: 10 });
    expect(color).toBe("#123456");
    expect(getElement(e.scene, elementId("dst"))!.style.fill).toBe("#123456");
  });

  it("reverts to select mode after a pick (tool not locked)", () => {
    const e = editorWith(sceneWith(rect("src", 0, 0, { fill: "#abcdef" }), rect("dst", 200, 0)));
    e.setSelection([elementId("dst")]);
    e.setMode("eyedropper");
    e.applyEyedropperAt({ x: 10, y: 10 });
    expect(e.mode).toBe("select");
  });

  it("returns null on empty canvas and mutates nothing", () => {
    const e = editorWith(sceneWith(rect("dst", 0, 0, { fill: "#000" })));
    e.setSelection([elementId("dst")]);
    expect(e.applyEyedropperAt({ x: 900, y: 900 })).toBeNull();
    expect(getElement(e.scene, elementId("dst"))!.style.fill).toBe("#000");
  });
});

describe("Editor.convertSelection (F9)", () => {
  it("converts the selected rectangle to an ellipse (undoable)", () => {
    const e = editorWith(sceneWith(rect("r")));
    e.setSelection([elementId("r")]);
    e.convertSelection("ellipse");
    expect(isEllipse(getElement(e.scene, elementId("r"))!)).toBe(true);
    e.undo();
    expect(getElement(e.scene, elementId("r"))!.type).toBe("rectangle");
  });
});

describe("Editor image-crop session (F10)", () => {
  it("begin → drag → commit writes the crop", () => {
    const e = editorWith(sceneWith(image("i")));
    e.beginImageCrop(elementId("i"));
    expect(e.mode).toBe("crop");
    expect(e.imageCropSession?.id).toBe(elementId("i"));
    e.beginImageCropDrag({ x: 25, y: 20 });
    e.updateImageCropDrag({ x: 75, y: 60 });
    e.endImageCropDrag();
    e.commitImageCrop();
    expect(e.mode).toBe("select");
    const crop = (getElement(e.scene, elementId("i"))! as { crop?: { width: number } }).crop;
    expect(crop?.width).toBeCloseTo(0.5);
  });

  it("cancel leaves the image uncropped and exits crop mode", () => {
    const e = editorWith(sceneWith(image("i")));
    e.beginImageCrop(elementId("i"));
    e.beginImageCropDrag({ x: 25, y: 20 });
    e.updateImageCropDrag({ x: 75, y: 60 });
    e.cancelImageCrop();
    expect(e.mode).toBe("select");
    expect(e.imageCropSession).toBeNull();
    expect((getElement(e.scene, elementId("i"))! as { crop?: unknown }).crop).toBeUndefined();
  });

  it("ignores beginImageCrop on a non-image", () => {
    const e = editorWith(sceneWith(rect("r")));
    e.beginImageCrop(elementId("r"));
    expect(e.mode).not.toBe("crop");
    expect(e.imageCropSession).toBeNull();
  });
});

describe("Editor.spawnConnectedNode (F11)", () => {
  it("spawns + links a node and selects it", () => {
    const e = editorWith(sceneWith(rect("src", 0, 0)));
    e.setSelection([elementId("src")]);
    e.spawnConnectedNode("right");
    expect(e.scene.links.size).toBe(1);
    expect(e.scene.elements.size).toBe(2);
    // The new node is selected (single selection, not the source).
    expect(e.selection.size).toBe(1);
    expect(e.selection.has(elementId("src"))).toBe(false);
  });

  it("no-op unless exactly one element is selected", () => {
    const e = editorWith(sceneWith(rect("a", 0, 0), rect("b", 200, 0)));
    e.setSelection([elementId("a"), elementId("b")]);
    e.spawnConnectedNode("down");
    expect(e.scene.elements.size).toBe(2);
    expect(e.scene.links.size).toBe(0);
  });
});
