import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { annotationId, commentId, elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addAnnotation,
  addElement,
  emptyScene,
  orderBetween,
  type Annotation,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { SceneDoc } from "../src/scene-doc";

const seed = (): Scene => {
  let s = emptyScene();
  const rect: Element = {
    id: elementId("r1"),
    layerId: DEFAULT_LAYER_ID,
    type: "rectangle",
    position: { x: 10, y: 20 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: { fill: "#abc" },
    width: 100,
    height: 60,
  };
  ({ scene: s } = addElement(s, rect));
  return s;
};

describe("SceneDoc", () => {
  it("round-trips replace → snapshot", () => {
    const doc = new SceneDoc();
    const scene = seed();
    doc.replace(scene);
    const out = doc.snapshot();
    expect(out.shapes.size).toBe(1);
    expect(out.shapes.get(elementId("r1"))?.position).toEqual({ x: 10, y: 20 });
  });

  it("applyDelta only ships diff", () => {
    const doc = new SceneDoc();
    const scene = seed();
    doc.replace(scene);

    let updates = 0;
    doc.doc.on("update", () => {
      updates += 1;
    });

    // No-op delta — same scene.
    doc.applyDelta(scene, scene);
    expect(updates).toBe(0);

    // Mutate one shape.
    const next: Scene = {
      ...scene,
      shapes: new Map([
        ...scene.shapes,
        [
          elementId("r2"),
          {
            ...scene.shapes.get(elementId("r1"))!,
            id: elementId("r2"),
            position: { x: 50, y: 50 },
          },
        ],
      ]),
    };
    doc.applyDelta(scene, next);
    expect(updates).toBe(1);
    expect(doc.snapshot().shapes.size).toBe(2);
  });

  it("two SceneDocs sync via Yjs update messages", () => {
    const a = new SceneDoc();
    const b = new SceneDoc();
    // Wire them: every update on `a` is applied to `b` and vice versa.
    a.doc.on("updateV2", (u) => Y.applyUpdateV2(b.doc, u));
    b.doc.on("updateV2", (u) => Y.applyUpdateV2(a.doc, u));

    a.replace(seed());
    expect(b.snapshot().shapes.size).toBe(1);
    expect(b.snapshot().shapes.get(elementId("r1"))?.position).toEqual({ x: 10, y: 20 });
  });

  it("annotations round-trip across two SceneDoc peers", () => {
    const a = new SceneDoc();
    const b = new SceneDoc();
    a.doc.on("updateV2", (u) => Y.applyUpdateV2(b.doc, u));
    b.doc.on("updateV2", (u) => Y.applyUpdateV2(a.doc, u));

    let scene = seed();
    const ann: Annotation = {
      id: annotationId("a1"),
      elementId: elementId("r1"),
      position: { x: 5, y: 5 },
      resolved: false,
      thread: [
        {
          id: commentId("c1"),
          authorId: "u1",
          authorName: "Alice",
          body: "Looks good",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    ({ scene } = addAnnotation(scene, ann));

    a.replace(scene);
    const snapshot = b.snapshot();
    expect(snapshot.annotations.size).toBe(1);
    expect(snapshot.annotations.get(ann.id)?.thread[0]?.body).toBe("Looks good");
  });
});
