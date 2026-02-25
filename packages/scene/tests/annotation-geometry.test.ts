import { describe, expect, it } from "vitest";
import { annotationId, commentId, elementId } from "@oh-just-another/types";
import {
  addAnnotation,
  addElement,
  emptyScene,
  getAnnotationWorldPosition,
  orderBetween,
  DEFAULT_LAYER_ID,
  type Annotation,
  type Element,
} from "../src/index";

const rect = (id: string, x: number, y: number, w = 50, h = 50): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: w,
  height: h,
});

const annotation = (
  overrides: Partial<Annotation> & Pick<Annotation, "id">,
): Annotation => ({
  elementId: null,
  position: { x: 0, y: 0 },
  resolved: false,
  thread: [
    {
      id: commentId("c1"),
      authorId: "u1",
      authorName: "Alice",
      body: "Test",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("getAnnotationWorldPosition", () => {
  it("free-floating annotation: returns position as-is (elementId === null)", () => {
    const ann = annotation({
      id: annotationId("a1"),
      elementId: null,
      position: { x: 100, y: 200 },
    });
    const { scene } = addAnnotation(emptyScene(), ann);
    const pos = getAnnotationWorldPosition(scene, ann);
    expect(pos).toEqual({ x: 100, y: 200 });
  });

  it("pinned to existing shape: returns shape.position + annotation.position", () => {
    const shape = rect("r1", 150, 80);
    const ann = annotation({
      id: annotationId("a1"),
      elementId: elementId("r1"),
      position: { x: 10, y: -5 },
    });
    let { scene } = addElement(emptyScene(), shape);
    ({ scene } = addAnnotation(scene, ann));
    const pos = getAnnotationWorldPosition(scene, ann);
    // shape is at (150, 80), annotation offset is (10, -5) → world = (160, 75)
    expect(pos).toEqual({ x: 160, y: 75 });
  });

  it("pinned to shape at origin: offset equals world position", () => {
    const shape = rect("r2", 0, 0);
    const ann = annotation({
      id: annotationId("a2"),
      elementId: elementId("r2"),
      position: { x: 25, y: 30 },
    });
    let { scene } = addElement(emptyScene(), shape);
    ({ scene } = addAnnotation(scene, ann));
    const pos = getAnnotationWorldPosition(scene, ann);
    expect(pos).toEqual({ x: 25, y: 30 });
  });

  it("pinned to non-existent shape: falls back to annotation.position", () => {
    const ann = annotation({
      id: annotationId("a3"),
      elementId: elementId("ghost"),
      position: { x: 42, y: 99 },
    });
    const { scene } = addAnnotation(emptyScene(), ann);
    const pos = getAnnotationWorldPosition(scene, ann);
    // shape doesn't exist → falls back to stored position
    expect(pos).toEqual({ x: 42, y: 99 });
  });

  it("shape with negative position: world offset computed correctly", () => {
    const shape = rect("r3", -100, -50);
    const ann = annotation({
      id: annotationId("a4"),
      elementId: elementId("r3"),
      position: { x: 5, y: 10 },
    });
    let { scene } = addElement(emptyScene(), shape);
    ({ scene } = addAnnotation(scene, ann));
    const pos = getAnnotationWorldPosition(scene, ann);
    expect(pos).toEqual({ x: -95, y: -40 });
  });

  it("zero-offset pin on a shape: returns exactly the shape position", () => {
    const shape = rect("r4", 300, 400);
    const ann = annotation({
      id: annotationId("a5"),
      elementId: elementId("r4"),
      position: { x: 0, y: 0 },
    });
    let { scene } = addElement(emptyScene(), shape);
    ({ scene } = addAnnotation(scene, ann));
    const pos = getAnnotationWorldPosition(scene, ann);
    expect(pos).toEqual({ x: 300, y: 400 });
  });
});
