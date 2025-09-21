import { describe, expect, it } from "vitest";
import { annotationId, commentId, elementId } from "@oh-just-another/types";
import {
  addAnnotation,
  emptyScene,
  invert,
  removeAnnotation,
  updateAnnotation,
  apply,
  type Annotation,
} from "../src/index";

const sample = (overrides: Partial<Annotation> = {}): Annotation => ({
  id: annotationId("a1"),
  elementId: null,
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
  ...overrides,
});

describe("annotation operations", () => {
  it("addAnnotation inserts into scene", () => {
    const ann = sample();
    const { scene } = addAnnotation(emptyScene(), ann);
    expect(scene.annotations.size).toBe(1);
    expect(scene.annotations.get(ann.id)).toEqual(ann);
  });

  it("addAnnotation rejects duplicate id", () => {
    const ann = sample();
    const { scene } = addAnnotation(emptyScene(), ann);
    expect(() => addAnnotation(scene, ann)).toThrow();
  });

  it("removeAnnotation deletes from scene", () => {
    const ann = sample();
    let scene = addAnnotation(emptyScene(), ann).scene;
    scene = removeAnnotation(scene, ann.id).scene;
    expect(scene.annotations.has(ann.id)).toBe(false);
  });

  it("updateAnnotation replaces in scene", () => {
    const ann = sample();
    let scene = addAnnotation(emptyScene(), ann).scene;
    scene = updateAnnotation(scene, ann.id, (a) => ({ ...a, resolved: true })).scene;
    expect(scene.annotations.get(ann.id)?.resolved).toBe(true);
  });

  it("patch invert restores previous state", () => {
    const ann = sample();
    const initial = addAnnotation(emptyScene(), ann).scene;
    const { scene: removed, patch } = removeAnnotation(initial, ann.id);
    const restored = apply(removed, invert(patch));
    expect(restored.annotations.get(ann.id)).toEqual(ann);
  });

  it("update with elementId anchors to shape", () => {
    const ann = sample({ elementId: elementId("rect-1") });
    const { scene } = addAnnotation(emptyScene(), ann);
    expect(scene.annotations.get(ann.id)?.elementId).toBe("rect-1");
  });
});
