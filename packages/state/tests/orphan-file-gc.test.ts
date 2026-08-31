/**
 * Binary files leave the document with their last shape: deleting an image
 * drops its `scene.files` entry in the same undoable step (so a host store
 * that mirrors `scene.files` stops growing), undo brings both back, and a
 * cut still pastes because the clipboard carries the bytes.
 */
import { describe, expect, it } from "vitest";
import { elementId, fileId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  apply,
  createBinaryFile,
  emptyScene,
  referencedFileIds,
  unreferencedFileIds,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const image = (id: string, file?: string): Element =>
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
    ...(file !== undefined ? { fileId: fileId(file) } : {}),
  }) as unknown as Element;

const withFile = (scene: Scene, id: string): Scene =>
  apply(scene, {
    kind: "file",
    id: fileId(id),
    before: null,
    after: createBinaryFile(fileId(id), new Uint8Array([1, 2, 3]).buffer, { mime: "image/png" }),
  });

const noop = () => undefined;
const noopTarget = new Proxy({ measureText: () => ({ width: 0 }) } as Record<string, unknown>, {
  get: (o, k: string) => (k in o ? o[k] : noop),
}) as never;
const host = {
  addEventListener: noop,
  removeEventListener: noop,
  setPointerCapture: noop,
  releasePointerCapture: noop,
  hasPointerCapture: () => true,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  style: { cursor: "" },
} as never;

const editorWith = (scene: Scene): Editor =>
  new Editor({ host, mainTarget: noopTarget, overlayTarget: noopTarget, initialScene: scene });

const oneImage = (): Scene => withFile(addElement(emptyScene(), image("i1", "f1")).scene, "f1");

describe("scene file references", () => {
  it("reports referenced and orphaned entries", () => {
    const scene = withFile(oneImage(), "f2");
    expect([...referencedFileIds(scene)]).toEqual([fileId("f1")]);
    expect(unreferencedFileIds(scene)).toEqual([fileId("f2")]);
    expect(unreferencedFileIds(emptyScene())).toEqual([]);
  });
});

describe("delete drops the files it orphans", () => {
  it("removes the entry with the last shape referencing it, and undo restores both", () => {
    const editor = editorWith(oneImage());
    editor.setSelection([elementId("i1")]);
    editor.deleteSelected();
    expect(editor.scene.elements.size).toBe(0);
    expect(editor.scene.files.size).toBe(0);
    editor.undo();
    expect(editor.scene.elements.size).toBe(1);
    expect(editor.scene.files.has(fileId("f1"))).toBe(true);
  });

  it("keeps a file another shape still references", () => {
    let scene = oneImage();
    ({ scene } = addElement(scene, image("i2", "f1")));
    const editor = editorWith(scene);
    editor.setSelection([elementId("i1")]);
    editor.deleteSelected();
    expect(editor.scene.files.has(fileId("f1"))).toBe(true);
    editor.setSelection([elementId("i2")]);
    editor.deleteSelected();
    expect(editor.scene.files.size).toBe(0);
  });

  it("leaves files alone when the deletion touches no image", () => {
    let scene = oneImage();
    ({ scene } = addElement(scene, {
      ...(image("r1") as unknown as Record<string, unknown>),
      type: "rectangle",
    } as unknown as Element));
    const editor = editorWith(scene);
    editor.setSelection([elementId("r1")]);
    editor.deleteSelected();
    expect(editor.scene.files.has(fileId("f1"))).toBe(true);
  });
});

describe("clipboard carries the bytes", () => {
  it("cut then paste re-adds the file the delete removed", () => {
    const editor = editorWith(oneImage());
    editor.setSelection([elementId("i1")]);
    editor.cutSelected();
    expect(editor.scene.files.size).toBe(0);
    editor.paste({ x: 200, y: 200 });
    const pasted = [...editor.scene.elements.values()][0] as { fileId?: string };
    expect(pasted.fileId).toBe("f1");
    expect(editor.scene.files.has(fileId("f1"))).toBe(true);
  });

  it("copy then paste does not duplicate the entry", () => {
    const editor = editorWith(oneImage());
    editor.setSelection([elementId("i1")]);
    editor.copySelected();
    editor.paste({ x: 200, y: 200 });
    expect(editor.scene.elements.size).toBe(2);
    expect(editor.scene.files.size).toBe(1);
  });
});
