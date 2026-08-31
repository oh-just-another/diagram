import { describe, expect, it } from "vitest";
import { elementId, fileId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  apply,
  createBinaryFile,
  emptyScene,
  orderBetween,
  referencedFileIds,
  unreferencedFileIds,
  type Element,
  type Scene,
} from "../src/index.js";

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
    width: 10,
    height: 10,
    ...(file !== undefined ? { fileId: fileId(file) } : {}),
  }) as unknown as Element;

const withFile = (scene: Scene, id: string): Scene =>
  apply(scene, {
    kind: "file",
    id: fileId(id),
    before: null,
    after: createBinaryFile(fileId(id), new Uint8Array([1]).buffer, { mime: "image/png" }),
  });

describe("referencedFileIds / unreferencedFileIds", () => {
  it("collects each referenced id once and lists the rest as unused", () => {
    let scene = addElement(emptyScene(), image("a", "f1")).scene;
    ({ scene } = addElement(scene, image("b", "f1")));
    ({ scene } = addElement(scene, image("c")));
    scene = withFile(withFile(scene, "f1"), "f2");
    expect([...referencedFileIds(scene)]).toEqual([fileId("f1")]);
    expect(unreferencedFileIds(scene)).toEqual([fileId("f2")]);
  });

  it("is empty for a scene without files or images", () => {
    expect([...referencedFileIds(emptyScene())]).toEqual([]);
    expect(unreferencedFileIds(emptyScene())).toEqual([]);
  });

  it("reports every entry as unused once the last referencing shape is gone", () => {
    const scene = withFile(emptyScene(), "f1");
    expect(unreferencedFileIds(scene)).toEqual([fileId("f1")]);
  });
});
