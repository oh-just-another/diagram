import { describe, expect, it } from "vitest";
import { annotationId, commentId, shapeId } from "@oh-just-another/types";
import {
  addAnnotation,
  addShape,
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Annotation,
  type Patch,
  type Shape,
} from "@oh-just-another/scene";
import { deserializeScene, parseScene, serializeScene, stringifyScene } from "../src/index";

const rect = (id: string, x = 0, y = 0): Shape => ({
  id: shapeId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#abc" },
  width: 10,
  height: 20,
});

describe("round-trip", () => {
  it("serialize → deserialize preserves shapes", () => {
    let scene = emptyScene();
    ({ scene } = addShape(scene, rect("a", 10, 20)));
    ({ scene } = addShape(scene, rect("b", 30, 40)));
    const doc = serializeScene(scene);
    const restored = deserializeScene(doc);
    expect(restored.shapes.size).toBe(2);
    expect(restored.shapes.get(shapeId("a"))?.position).toEqual({ x: 10, y: 20 });
    expect(restored.shapes.get(shapeId("b"))?.position).toEqual({ x: 30, y: 40 });
  });

  it("preserves layers (including the default one)", () => {
    const restored = deserializeScene(serializeScene(emptyScene()));
    expect(restored.layers.size).toBe(1);
    expect(restored.layers.get(DEFAULT_LAYER_ID)?.name).toBe("Default");
  });

  it("preserves viewport", () => {
    let scene = emptyScene();
    scene = {
      ...scene,
      viewport: { pan: { x: 10, y: 0 }, zoom: 2, rotation: 0, size: { width: 800, height: 600 } },
    };
    const restored = deserializeScene(serializeScene(scene));
    expect(restored.viewport).toEqual(scene.viewport);
  });

  it("stringify → parseScene round-trip", () => {
    let scene = emptyScene();
    ({ scene } = addShape(scene, rect("a")));
    const json = stringifyScene(scene, 2);
    expect(json).toContain('"format": "oh-just-another/scene"');
    const restored = parseScene(json);
    expect(restored.shapes.size).toBe(1);
  });

  it("preserves all built-in shape kinds", () => {
    const ids = ["r", "e", "p", "t", "i"];
    let scene = emptyScene();
    const variants: Shape[] = [
      rect("r"),
      { ...rect("e"), type: "ellipse" as const, id: shapeId("e") },
      {
        id: shapeId("p"),
        layerId: DEFAULT_LAYER_ID,
        type: "polygon",
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        order: orderBetween(null, null),
        style: {},
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
      },
      {
        id: shapeId("t"),
        layerId: DEFAULT_LAYER_ID,
        type: "text",
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        order: orderBetween(null, null),
        style: { fill: "#000" },
        text: "Hello",
        fontFamily: "system-ui",
        fontSize: 14,
      },
      {
        id: shapeId("i"),
        layerId: DEFAULT_LAYER_ID,
        type: "image",
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        order: orderBetween(null, null),
        style: {},
        src: "data:,",
        width: 50,
        height: 50,
      },
    ];
    for (const s of variants) {
      const result = addShape(scene, s);
      scene = result.scene;
    }
    const restored = deserializeScene(serializeScene(scene));
    for (const id of ids) {
      expect(restored.shapes.get(shapeId(id))?.type).toBe(scene.shapes.get(shapeId(id))?.type);
    }
  });

  it("undo patches keep working after round-trip", () => {
    let scene = emptyScene();
    const r = rect("a");
    const result = addShape(scene, r);
    scene = result.scene;
    const restored = deserializeScene(serializeScene(scene));
    // Apply an undo-style patch built from the restored shape.
    const undo: Patch = {
      kind: "shape",
      id: r.id,
      before: restored.shapes.get(r.id)!,
      after: null,
    };
    const after = apply(restored, undo);
    expect(after.shapes.size).toBe(0);
  });

  it("serialize → deserialize preserves annotations", () => {
    let scene = emptyScene();
    const ann: Annotation = {
      id: annotationId("a1"),
      shapeId: shapeId("rect-1"),
      position: { x: 10, y: 20 },
      resolved: false,
      thread: [
        {
          id: commentId("c1"),
          authorId: "u1",
          authorName: "Alice",
          body: "First!",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    ({ scene } = addAnnotation(scene, ann));
    const restored = deserializeScene(serializeScene(scene));
    expect(restored.annotations.size).toBe(1);
    expect(restored.annotations.get(ann.id)).toEqual(ann);
  });

  it("empty annotation map → no `annotations` field in document", () => {
    const scene = emptyScene();
    const doc = serializeScene(scene);
    expect(doc.annotations).toBeUndefined();
  });

  it("parseScene of a document without annotations works", () => {
    const legacy = stringifyScene(emptyScene());
    const parsed = parseScene(legacy);
    expect(parsed.annotations.size).toBe(0);
  });
});
