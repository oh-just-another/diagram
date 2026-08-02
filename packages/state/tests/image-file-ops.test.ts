/**
 * Image file operations behind the toolbar: renaming the backing binary
 * file, alt-text editing, and replacing the image's bytes while keeping
 * the shape's geometry. All undoable.
 */
import { describe, expect, it } from "vitest";
import { elementId, fileId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  apply,
  createBinaryFile,
  emptyScene,
  getBinaryFile,
  orderBetween,
  type Element,
  type ImageElement,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const image = (id: string, withFile?: string): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "image",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    src: "data:,",
    width: 40,
    height: 30,
    ...(withFile !== undefined ? { fileId: fileId(withFile) } : {}),
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

const withFile = (scene: Scene, id: string, name?: string): Scene =>
  apply(scene, {
    kind: "file",
    id: fileId(id),
    before: null,
    after: createBinaryFile(fileId(id), new Uint8Array([1, 2, 3]).buffer, {
      mime: "image/png",
      ...(name !== undefined ? { name } : {}),
    }),
  });

describe("renameBinaryFile", () => {
  it("renames, is undoable and no-ops on unknown ids", () => {
    const e = editorWith(withFile(sceneWith(image("i", "f1")), "f1", "old.png"));
    e.renameBinaryFile(fileId("f1"), "new.png");
    expect(getBinaryFile(e.scene, fileId("f1"))?.name).toBe("new.png");
    e.undo();
    expect(getBinaryFile(e.scene, fileId("f1"))?.name).toBe("old.png");
    e.renameBinaryFile(fileId("missing"), "x"); // no-op, no throw
  });
});

describe("setImageAlt", () => {
  it("sets and clears alt on image shapes only", () => {
    const e = editorWith(sceneWith(image("i")));
    e.setImageAlt([elementId("i")], "a chart");
    expect((e.scene.elements.get(elementId("i")) as ImageElement).alt).toBe("a chart");
    e.setImageAlt([elementId("i")], null);
    expect((e.scene.elements.get(elementId("i")) as ImageElement).alt).toBeUndefined();
  });
});

describe("setImageMask", () => {
  it("sets, replaces and clears the mask (undoable)", () => {
    const e = editorWith(sceneWith(image("i")));
    e.setImageMask([elementId("i")], { kind: "ellipse" });
    let img = e.scene.elements.get(elementId("i")) as ImageElement & { mask?: unknown };
    expect(img.mask).toEqual({ kind: "ellipse" });
    e.setImageMask([elementId("i")], { kind: "round-rect", radius: 0.3 });
    img = e.scene.elements.get(elementId("i")) as ImageElement & { mask?: unknown };
    expect(img.mask).toEqual({ kind: "round-rect", radius: 0.3 });
    e.setImageMask([elementId("i")], null);
    img = e.scene.elements.get(elementId("i")) as ImageElement & { mask?: unknown };
    expect(img.mask).toBeUndefined();
    e.undo();
    img = e.scene.elements.get(elementId("i")) as ImageElement & { mask?: unknown };
    expect(img.mask).toEqual({ kind: "round-rect", radius: 0.3 });
  });

  it("ignores non-image shapes", () => {
    const e = editorWith(sceneWith(image("i")));
    e.setImageMask([elementId("nope")], { kind: "ellipse" });
    expect((e.scene.elements.get(elementId("i")) as { mask?: unknown }).mask).toBeUndefined();
  });
});

describe("setImageAspectPreset", () => {
  // Base image: 40×30 box, no crop → natural aspect 4:3.
  it("square centre-crops the longer axis and refits the box to 1:1", () => {
    const e = editorWith(sceneWith(image("i")));
    e.setImageAspectPreset([elementId("i")], "square");
    const img = e.scene.elements.get(elementId("i")) as ImageElement;
    expect(img.width).toBe(40);
    expect(img.height).toBe(40);
    expect(img.crop).toEqual({ x: (1 - 0.75) / 2, y: 0, width: 0.75, height: 1 });
  });

  it("circle = square box + ellipse mask", () => {
    const e = editorWith(sceneWith(image("i")));
    e.setImageAspectPreset([elementId("i")], "circle");
    const img = e.scene.elements.get(elementId("i")) as ImageElement & { mask?: unknown };
    expect(img.height).toBe(img.width);
    expect(img.mask).toEqual({ kind: "ellipse" });
  });

  it("wide trims the vertical axis when the source is taller than 16:9", () => {
    const e = editorWith(sceneWith(image("i")));
    e.setImageAspectPreset([elementId("i")], "wide");
    const img = e.scene.elements.get(elementId("i")) as ImageElement;
    expect(img.height).toBeCloseTo(40 / (16 / 9));
    // natural 4/3 < 16/9 → full width, cropped height = (4/3) / (16/9) = 0.75.
    expect(img.crop?.width).toBe(1);
    expect(img.crop?.height).toBeCloseTo(0.75);
    expect(img.crop?.y).toBeCloseTo(0.125);
  });

  it("original clears crop + mask and restores the natural aspect", () => {
    const e = editorWith(sceneWith(image("i")));
    e.setImageAspectPreset([elementId("i")], "circle");
    e.setImageAspectPreset([elementId("i")], "original");
    const img = e.scene.elements.get(elementId("i")) as ImageElement & { mask?: unknown };
    expect(img.crop).toBeUndefined();
    expect(img.mask).toBeUndefined();
    // Natural aspect 4:3 survives the round-trip through the square crop.
    expect(img.width / img.height).toBeCloseTo(4 / 3);
  });
});

describe("replaceImageFile", () => {
  it("registers new bytes, repoints fileId and keeps geometry (one undo)", async () => {
    const e = editorWith(withFile(sceneWith(image("i", "f1")), "f1", "old.png"));
    const before = e.scene.elements.get(elementId("i")) as ImageElement;
    const blob = new Blob([new Uint8Array([9, 9, 9])], { type: "image/png" });
    await e.replaceImageFile(elementId("i"), blob, "next.png");
    const after = e.scene.elements.get(elementId("i")) as ImageElement;
    expect(after.fileId).not.toBe(before.fileId);
    expect(after.width).toBe(before.width);
    expect(getBinaryFile(e.scene, after.fileId!)?.name).toBe("next.png");
    e.undo();
    const reverted = e.scene.elements.get(elementId("i")) as ImageElement;
    expect(reverted.fileId).toBe(before.fileId);
  });

  it("replacing with a GIF sets the animation fields and resets the crop", async () => {
    const cropped = {
      ...image("i", "f1"),
      crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
    } as unknown as Element;
    const e = editorWith(withFile(sceneWith(cropped), "f1", "old.png"));
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/gif" });
    await e.replaceImageFile(elementId("i"), blob, "anim.gif");
    const after = e.scene.elements.get(elementId("i")) as ImageElement;
    expect(after.animationKind).toBe("gif");
    expect(after.animationData).toBeInstanceOf(ArrayBuffer);
    expect(after.metadata?.animated).toBe(true);
    expect(after.crop).toBeUndefined(); // media kind changed — crop reset
  });

  it("replacing a GIF with a static image clears the animation fields", async () => {
    const gifShape = {
      ...image("i", "f1"),
      animationKind: "gif",
      animationData: new Uint8Array([1]).buffer,
      metadata: { animated: true },
    } as unknown as Element;
    const e = editorWith(withFile(sceneWith(gifShape), "f1", "old.gif"));
    const blob = new Blob([new Uint8Array([9])], { type: "image/png" });
    await e.replaceImageFile(elementId("i"), blob, "still.png");
    const after = e.scene.elements.get(elementId("i")) as ImageElement;
    expect(after.animationKind).toBeUndefined();
    expect(after.animationData).toBeUndefined();
    expect(after.metadata?.animated).toBeUndefined();
  });

  it("keeps the crop when the media kind is unchanged", async () => {
    const cropped = {
      ...image("i", "f1"),
      crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
    } as unknown as Element;
    const e = editorWith(withFile(sceneWith(cropped), "f1", "old.png"));
    const blob = new Blob([new Uint8Array([9, 9])], { type: "image/png" });
    await e.replaceImageFile(elementId("i"), blob, "next.png");
    const after = e.scene.elements.get(elementId("i")) as ImageElement;
    expect(after.crop).toEqual({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 });
  });
});
