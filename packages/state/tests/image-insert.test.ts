import { describe, expect, it } from "vitest";
import { elementId, fileId as castFileId, type LayerId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  getBinaryFile,
  isImage,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import {
  buildImageElement,
  computeAddBinaryFile,
  hasAnimatedElement,
} from "../src/editor/public/image-insert.js";

// Behavioural coverage for the image-insert helpers that back `Editor.insertImage`
// / `Editor.addBinaryFile`: building the image shape (all optional payload
// branches), registering the raw bytes as a BinaryFile, and the animated-scene
// predicate.

const baseInput = () => ({
  src: "data:image/png;base64,AAAA",
  width: 120,
  height: 80,
  position: { x: 10, y: 20 },
});

describe("buildImageElement", () => {
  it("builds a minimal image shape with sane defaults and no optional keys", () => {
    const el = buildImageElement(
      emptyScene(),
      baseInput(),
      elementId("img-1"),
      DEFAULT_LAYER_ID,
    ) as Element & { width: number; height: number; src: string };
    expect(el.type).toBe("image");
    expect(el.id).toBe(elementId("img-1"));
    expect(el.layerId).toBe(DEFAULT_LAYER_ID);
    expect(el.position).toEqual({ x: 10, y: 20 });
    expect(el.rotation).toBe(0);
    expect(el.scale).toEqual({ x: 1, y: 1 });
    expect(el.width).toBe(120);
    expect(el.height).toBe(80);
    expect(el.src).toBe("data:image/png;base64,AAAA");
    // No optional payload → no fileId / animationKind / animationData / metadata.
    expect("fileId" in el).toBe(false);
    expect("animationKind" in el).toBe(false);
    expect("animationData" in el).toBe(false);
    expect(el.metadata).toBeUndefined();
  });

  it("stashes a decoded bitmap under metadata.image", () => {
    const bitmap = { width: 1, height: 1 } as unknown as ImageBitmap;
    const el = buildImageElement(
      emptyScene(),
      { ...baseInput(), image: bitmap },
      elementId("img-1"),
      DEFAULT_LAYER_ID,
    );
    expect(el.metadata?.image).toBe(bitmap);
    // Not flagged animated when only an image is supplied.
    expect(el.metadata?.animated).toBeUndefined();
  });

  it("flags an animated image via metadata.animated", () => {
    const el = buildImageElement(
      emptyScene(),
      { ...baseInput(), animated: true },
      elementId("img-1"),
      DEFAULT_LAYER_ID,
    );
    expect(el.metadata?.animated).toBe(true);
  });

  it("threads fileId, animationKind and animationData onto the shape", () => {
    const data = new ArrayBuffer(8);
    const el = buildImageElement(
      emptyScene(),
      {
        ...baseInput(),
        animated: true,
        fileId: castFileId("file-7"),
        animationKind: "gif",
        animationData: data,
      },
      elementId("img-1"),
      DEFAULT_LAYER_ID,
    ) as Element & { fileId: string; animationKind: string; animationData: ArrayBuffer };
    expect(el.fileId).toBe(castFileId("file-7"));
    expect(el.animationKind).toBe("gif");
    expect(el.animationData).toBe(data);
  });

  it("orders the new shape above existing shapes on the same layer", () => {
    const existing: Element = {
      id: elementId("bg"),
      layerId: DEFAULT_LAYER_ID,
      type: "rectangle",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      width: 10,
      height: 10,
    } as Element;
    const scene = addElement(emptyScene(), existing).scene;
    const el = buildImageElement(scene, baseInput(), elementId("img-1"), DEFAULT_LAYER_ID);
    // orderForTop puts the fresh shape strictly after the only sibling.
    expect(el.order > existing.order).toBe(true);
  });

  it("ignores siblings on other layers when computing the top order", () => {
    const other: Element = {
      id: elementId("other"),
      layerId: "layer-other" as LayerId,
      type: "rectangle",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      width: 10,
      height: 10,
    } as Element;
    const scene = addElement(emptyScene(), other).scene;
    // Target layer is empty → order comes from an empty sibling list, so it is
    // simply a valid top order (does not throw, produces a string key).
    const el = buildImageElement(scene, baseInput(), elementId("img-1"), DEFAULT_LAYER_ID);
    expect(typeof el.order).toBe("string");
  });
});

describe("computeAddBinaryFile", () => {
  const seed = () => {
    let n = 0;
    return () => ++n;
  };

  it("reads the blob bytes and registers a BinaryFile with its mime", async () => {
    const scene: Scene = emptyScene();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const blob = new Blob([bytes], { type: "image/gif" });
    const { scene: next, patch, id } = await computeAddBinaryFile(scene, blob, "pic.gif", seed());
    // Patch describes a fresh file insertion.
    expect(patch.kind).toBe("file");
    expect((patch as { before: unknown }).before).toBeNull();
    // The file lands in the returned scene and carries the exact bytes + mime.
    const file = getBinaryFile(next, id);
    expect(file).toBeDefined();
    expect(file?.mime).toBe("image/gif");
    expect(file?.name).toBe("pic.gif");
    expect(new Uint8Array(file!.data)).toEqual(bytes);
  });

  it("falls back to application/octet-stream when the blob has no type", async () => {
    const blob = new Blob([new Uint8Array([9])]);
    const { scene: next, id } = await computeAddBinaryFile(emptyScene(), blob, undefined, seed());
    expect(getBinaryFile(next, id)?.mime).toBe("application/octet-stream");
  });

  it("omits the name when none is provided", async () => {
    const blob = new Blob([new Uint8Array([9])], { type: "image/png" });
    const { scene: next, id } = await computeAddBinaryFile(emptyScene(), blob, undefined, seed());
    expect(getBinaryFile(next, id)?.name).toBeUndefined();
  });

  it("mints the id from the seed counter", async () => {
    const blob = new Blob([new Uint8Array([1])], { type: "image/png" });
    let n = 40;
    const { id } = await computeAddBinaryFile(emptyScene(), blob, undefined, () => ++n);
    expect(id).toContain("file-41-");
  });

  it("does not mutate the input scene (returns a new one)", async () => {
    const scene = emptyScene();
    const blob = new Blob([new Uint8Array([1])], { type: "image/png" });
    const { scene: next } = await computeAddBinaryFile(scene, blob, undefined, seed());
    expect(next).not.toBe(scene);
    expect(scene.files.size).toBe(0);
  });
});

describe("hasAnimatedElement", () => {
  const imageEl = (id: string, animated: boolean): Element =>
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
      width: 10,
      height: 10,
      ...(animated ? { metadata: { animated: true } } : {}),
    }) as Element;

  it("is false for an empty scene", () => {
    expect(hasAnimatedElement(emptyScene())).toBe(false);
  });

  it("is false when no shape carries metadata.animated", () => {
    const scene = addElement(emptyScene(), imageEl("a", false)).scene;
    expect(hasAnimatedElement(scene)).toBe(false);
  });

  it("is true once any shape carries metadata.animated", () => {
    let scene = addElement(emptyScene(), imageEl("a", false)).scene;
    scene = addElement(scene, imageEl("b", true)).scene;
    expect(hasAnimatedElement(scene)).toBe(true);
    // Sanity: the animated shape really is an image.
    expect(isImage(scene.elements.get(elementId("b"))!)).toBe(true);
  });
});
