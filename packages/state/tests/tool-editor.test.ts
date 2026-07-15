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

  it("keeps the current mode after a pick (sampling is not a tool switch)", () => {
    const e = editorWith(sceneWith(rect("src", 0, 0, { fill: "#abcdef" }), rect("dst", 200, 0)));
    e.setSelection([elementId("dst")]);
    e.applyEyedropperAt({ x: 10, y: 10 });
    expect(e.activeTool.type).toBe("select");
  });

  it("returns null on empty canvas and mutates nothing", () => {
    const e = editorWith(sceneWith(rect("dst", 0, 0, { fill: "#000" })));
    e.setSelection([elementId("dst")]);
    expect(e.applyEyedropperAt({ x: 900, y: 900 })).toBeNull();
    expect(getElement(e.scene, elementId("dst"))!.style.fill).toBe("#000");
  });

  it("when armed by a colour-picker pipette, routes the colour to the callback (not the selection fill)", () => {
    const e = editorWith(sceneWith(rect("src", 0, 0, { fill: "#123456" }), rect("dst", 200, 0)));
    e.setSelection([elementId("dst")]);
    let picked: string | null = null;
    e.beginEyedropperPick((c) => {
      picked = c;
    });
    expect(e.isEyedropperArmed).toBe(true);
    const color = e.applyEyedropperAt({ x: 10, y: 10 });
    expect(color).toBe("#123456");
    expect(picked).toBe("#123456");
    // The selection is NOT recoloured — the pipette feeds the picker, not the fill.
    expect(getElement(e.scene, elementId("dst"))!.style.fill).toBeUndefined();
    // One-shot: disarmed after the pick.
    expect(e.isEyedropperArmed).toBe(false);
  });

  it("a mode switch cancels an armed pipette", () => {
    const e = editorWith(sceneWith(rect("src", 0, 0, { fill: "#111" })));
    e.beginEyedropperPick(() => {
      /* never called */
    });
    expect(e.isEyedropperArmed).toBe(true);
    e.setActiveTool("brush");
    expect(e.isEyedropperArmed).toBe(false);
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

describe("Editor image-crop session (F10, Excalidraw-style)", () => {
  // Image is 100 × 80 at the origin (see `image` helper), scale 1.
  const croppedImage = (id: string): Element =>
    ({
      ...image(id),
      crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    }) as Element;

  it("entering crop mode selects the image and seeds the pending box", () => {
    const e = editorWith(sceneWith(image("i")));
    e.beginImageCrop(elementId("i"));
    expect(e.activeTool.type).toBe("crop");
    expect(e.imageCropSession?.id).toBe(elementId("i"));
    expect(e.imageCropSession?.width).toBe(100);
    expect(e.imageCropSession?.height).toBe(80);
  });

  it("cropHandleAtWorld hit-tests handles, body and empty space", () => {
    const e = editorWith(sceneWith(image("i")));
    e.beginImageCrop(elementId("i"));
    expect(e.cropHandleAtWorld({ x: 0, y: 0 })).toBe("nw");
    expect(e.cropHandleAtWorld({ x: 100, y: 40 })).toBe("e");
    expect(e.cropHandleAtWorld({ x: 50, y: 40 })).toBe("body");
    expect(e.cropHandleAtWorld({ x: 500, y: 500 })).toBeNull();
  });

  it("handle drag updates the pending crop AND the element box", () => {
    const e = editorWith(sceneWith(image("i")));
    e.beginImageCrop(elementId("i"));
    e.beginImageCropHandle("w", { x: 0, y: 40 });
    e.updateImageCropDrag({ x: 20, y: 40 });
    expect(e.imageCropSession?.width).toBeCloseTo(80);
    expect(e.imageCropSession?.position.x).toBeCloseTo(20);
    expect(e.imageCropSession?.crop.x).toBeCloseTo(0.2);
    e.endImageCropDrag();
    e.commitImageCrop();
    expect(e.activeTool.type).toBe("select");
    const el = getElement(e.scene, elementId("i"))! as {
      crop?: { x: number };
      position: { x: number };
      width: number;
    };
    expect(el.width).toBeCloseTo(80);
    expect(el.position.x).toBeCloseTo(20);
    expect(el.crop?.x).toBeCloseTo(0.2);
  });

  it("body pan shifts the crop but leaves the element box unchanged", () => {
    const e = editorWith(sceneWith(croppedImage("i")));
    e.beginImageCrop(elementId("i"));
    e.beginImageCropBody({ x: 50, y: 40 });
    e.updateImageCropDrag({ x: 70, y: 40 }); // drag body right by 20 world units
    e.endImageCropDrag();
    e.commitImageCrop();
    const el = getElement(e.scene, elementId("i"))! as {
      crop?: { x: number };
      position: { x: number };
      width: number;
    };
    expect(el.position.x).toBe(0); // box unchanged
    expect(el.width).toBe(100);
    expect(el.crop?.x).toBeCloseTo(0.15); // 0.25 - 20/200
  });

  it("commit is one undo step; undo restores the original geometry", () => {
    const e = editorWith(sceneWith(image("i")));
    e.beginImageCrop(elementId("i"));
    e.beginImageCropHandle("w", { x: 0, y: 40 });
    e.updateImageCropDrag({ x: 20, y: 40 });
    e.endImageCropDrag();
    e.commitImageCrop();
    expect((getElement(e.scene, elementId("i"))! as { width: number }).width).toBeCloseTo(80);
    e.undo();
    const restored = getElement(e.scene, elementId("i"))! as { crop?: unknown; width: number };
    expect(restored.width).toBe(100);
    expect(restored.crop).toBeUndefined();
  });

  it("cancel leaves the image unchanged and exits crop mode", () => {
    const e = editorWith(sceneWith(image("i")));
    e.beginImageCrop(elementId("i"));
    e.beginImageCropHandle("w", { x: 0, y: 40 });
    e.updateImageCropDrag({ x: 20, y: 40 });
    e.cancelImageCrop();
    expect(e.activeTool.type).toBe("select");
    expect(e.imageCropSession).toBeNull();
    const el = getElement(e.scene, elementId("i"))! as { crop?: unknown; width: number };
    expect(el.crop).toBeUndefined();
    expect(el.width).toBe(100);
  });

  it("ignores beginImageCrop on a non-image", () => {
    const e = editorWith(sceneWith(rect("r")));
    e.beginImageCrop(elementId("r"));
    expect(e.activeTool.type).not.toBe("crop");
    expect(e.imageCropSession).toBeNull();
  });

  it("read-only never enters crop mode", () => {
    const e = editorWith(sceneWith(image("i")));
    e.setReadOnly(true);
    e.beginImageCrop(elementId("i"));
    expect(e.activeTool.type).not.toBe("crop");
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
