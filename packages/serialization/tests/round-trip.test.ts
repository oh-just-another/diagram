import { describe, expect, it } from "vitest";
import { annotationId, commentId, fileId, elementId, linkId } from "@oh-just-another/types";
import {
  addAnnotation,
  addElement,
  addLink,
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Annotation,
  type Patch,
  type Element,
  type Link,
} from "@oh-just-another/scene";
import { deserializeScene, parseScene, serializeScene, stringifyScene } from "../src/index";

const rect = (id: string, x = 0, y = 0): Element => ({
  id: elementId(id),
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
    ({ scene } = addElement(scene, rect("a", 10, 20)));
    ({ scene } = addElement(scene, rect("b", 30, 40)));
    const doc = serializeScene(scene);
    const restored = deserializeScene(doc);
    expect(restored.elements.size).toBe(2);
    expect(restored.elements.get(elementId("a"))?.position).toEqual({ x: 10, y: 20 });
    expect(restored.elements.get(elementId("b"))?.position).toEqual({ x: 30, y: 40 });
  });

  it("preserves an element's frameId (frame membership)", () => {
    let scene = emptyScene();
    ({ scene } = addElement(scene, { ...rect("a", 10, 20), frameId: elementId("F") }));
    const restored = deserializeScene(serializeScene(scene));
    expect(restored.elements.get(elementId("a"))?.frameId).toBe(elementId("F"));
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

  it("preserves grid + snap viewport preferences", () => {
    let scene = emptyScene();
    scene = {
      ...scene,
      viewport: {
        ...scene.viewport,
        gridSize: 20,
        gridStyle: "dots",
        snapToGrid: false,
      },
    };
    const restored = deserializeScene(serializeScene(scene));
    expect(restored.viewport.gridStyle).toBe("dots");
    expect(restored.viewport.snapToGrid).toBe(false);
    expect(restored.viewport.gridSize).toBe(20);
  });

  it("preserves a link's avoidObstacles + routing", () => {
    let scene = emptyScene();
    const link: Link = {
      id: linkId("L"),
      layerId: DEFAULT_LAYER_ID,
      from: { kind: "point", position: { x: 0, y: 0 } },
      to: { kind: "point", position: { x: 100, y: 0 } },
      routing: "orthogonal",
      avoidObstacles: true,
      order: orderBetween(null, null),
      style: { stroke: "#000" },
    };
    ({ scene } = addLink(scene, link));
    const restored = deserializeScene(serializeScene(scene));
    const r = [...restored.links.values()][0]!;
    expect(r.avoidObstacles).toBe(true);
    expect(r.routing).toBe("orthogonal");
  });

  it("stringify → parseScene round-trip", () => {
    let scene = emptyScene();
    ({ scene } = addElement(scene, rect("a")));
    const json = stringifyScene(scene, 2);
    expect(json).toContain('"format": "oh-just-another/scene"');
    const restored = parseScene(json);
    expect(restored.elements.size).toBe(1);
  });

  it("preserves all built-in shape kinds", () => {
    const ids = ["r", "e", "p", "t", "i"];
    let scene = emptyScene();
    const variants: Element[] = [
      rect("r"),
      { ...rect("e"), type: "ellipse" as const, id: elementId("e") },
      {
        id: elementId("p"),
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
        id: elementId("t"),
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
        id: elementId("i"),
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
      const result = addElement(scene, s);
      scene = result.scene;
    }
    const restored = deserializeScene(serializeScene(scene));
    for (const id of ids) {
      expect(restored.elements.get(elementId(id))?.type).toBe(
        scene.elements.get(elementId(id))?.type,
      );
    }
  });

  it("preserves text decoration style (weight / italic / underline / strike)", () => {
    let scene = emptyScene();
    const t: Element = {
      id: elementId("td"),
      layerId: DEFAULT_LAYER_ID,
      type: "text",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {
        fill: "#000",
        textAlign: "center",
        fontWeight: "bold",
        fontStyle: "italic",
        textDecoration: { underline: true, strikethrough: true },
      },
      text: "Hi",
      fontFamily: "system-ui",
      fontSize: 18,
    } as unknown as Element;
    ({ scene } = addElement(scene, t));
    const restored = deserializeScene(serializeScene(scene));
    const st = (
      restored.elements.get(elementId("td")) as unknown as { style: Record<string, unknown> }
    ).style;
    expect(st.fontWeight).toBe("bold");
    expect(st.fontStyle).toBe("italic");
    expect(st.textDecoration).toEqual({ underline: true, strikethrough: true });
    expect(st.textAlign).toBe("center");
  });

  it("preserves element href", () => {
    let scene = emptyScene();
    const r: Element = {
      id: elementId("lk"),
      layerId: DEFAULT_LAYER_ID,
      type: "rectangle",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      width: 10,
      height: 10,
      href: "https://example.com/x",
    } as unknown as Element;
    ({ scene } = addElement(scene, r));
    const restored = deserializeScene(serializeScene(scene));
    expect((restored.elements.get(elementId("lk")) as { href?: string }).href).toBe(
      "https://example.com/x",
    );
  });

  it("preserves image fileId + animation fields", () => {
    let scene = emptyScene();
    const img: Element = {
      id: elementId("img-1"),
      layerId: DEFAULT_LAYER_ID,
      type: "image",
      position: { x: 5, y: 5 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      src: "blob:fake",
      width: 120,
      height: 80,
      fileId: fileId("file-42-abc"),
      animationKind: "gif",
      metadata: { animated: true },
    };
    ({ scene } = addElement(scene, img));
    const restored = deserializeScene(serializeScene(scene));
    const r = restored.elements.get(elementId("img-1"));
    expect(r?.type).toBe("image");
    expect((r as { fileId?: string }).fileId).toBe("file-42-abc");
    expect((r as { animationKind?: string }).animationKind).toBe("gif");
    expect(r?.metadata?.animated).toBe(true);
  });

  it("strips transient metadata.image but keeps metadata.animated", () => {
    let scene = emptyScene();
    const img: Element = {
      id: elementId("img-1"),
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
      // The live DOM handle the file-drop handler attaches.
      metadata: { image: { fake: "dom-element" }, animated: true },
    };
    ({ scene } = addElement(scene, img));
    const doc = serializeScene(scene);
    const serialized = doc.elements.find((s) => s.id === "img-1");
    expect(serialized?.metadata).toBeDefined();
    expect((serialized?.metadata as Record<string, unknown>).image).toBeUndefined();
    expect((serialized?.metadata as Record<string, unknown>).animated).toBe(true);
    const restored = deserializeScene(doc);
    expect(restored.elements.get(elementId("img-1"))?.metadata?.animated).toBe(true);
    expect(restored.elements.get(elementId("img-1"))?.metadata?.image).toBeUndefined();
  });

  it("drops metadata entirely when only transient image was present", () => {
    let scene = emptyScene();
    const img: Element = {
      id: elementId("img-2"),
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
      metadata: { image: { fake: "dom" } },
    };
    ({ scene } = addElement(scene, img));
    const doc = serializeScene(scene);
    const serialized = doc.elements.find((s) => s.id === "img-2");
    expect(serialized?.metadata).toBeUndefined();
  });

  it("confetti template metadata (animated + confetti config) round-trips through the store", () => {
    // The custom.confetti template is a plain rectangle carrying
    // metadata.animated (arms the AnimationTick) and metadata.confetti
    // (read by the renderer). Both are plain JSON and must survive
    // stringifyScene → parseScene.
    let scene = emptyScene();
    const confettiBox: Element = {
      ...rect("confetti-1"),
      metadata: {
        animated: true,
        confetti: {
          emitters: [
            { cx: 0.25, cy: 0.5, dirX: -1, dirY: -1 },
            { cx: 0.75, cy: 0.5, dirX: 1, dirY: -1 },
          ],
        },
      },
    };
    ({ scene } = addElement(scene, confettiBox));

    const restored = parseScene(stringifyScene(scene));
    const r = restored.elements.get(elementId("confetti-1"));
    expect(r?.metadata?.animated).toBe(true);
    expect(r?.metadata?.confetti).toEqual({
      emitters: [
        { cx: 0.25, cy: 0.5, dirX: -1, dirY: -1 },
        { cx: 0.75, cy: 0.5, dirX: 1, dirY: -1 },
      ],
    });
  });

  it("undo patches keep working after round-trip", () => {
    let scene = emptyScene();
    const r = rect("a");
    const result = addElement(scene, r);
    scene = result.scene;
    const restored = deserializeScene(serializeScene(scene));
    // Apply an undo-style patch built from the restored shape.
    const undo: Patch = {
      kind: "element",
      id: r.id,
      before: restored.elements.get(r.id)!,
      after: null,
    };
    const after = apply(restored, undo);
    expect(after.elements.size).toBe(0);
  });

  it("serialize → deserialize preserves annotations", () => {
    let scene = emptyScene();
    const ann: Annotation = {
      id: annotationId("a1"),
      elementId: elementId("rect-1"),
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
