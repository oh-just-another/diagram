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
});
