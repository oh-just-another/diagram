import { describe, expect, it } from "vitest";
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
import { Editor } from "../src/editor.js";

const rect = (id: string, x = 0, y = 0): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 50,
  height: 50,
});

const freeAnnotation = (id: string, x: number, y: number): Annotation => ({
  id: annotationId(id),
  elementId: null,
  position: { x, y },
  resolved: false,
  thread: [
    {
      id: commentId(`${id}-c1`),
      authorId: "u",
      authorName: "u",
      body: "hello",
      createdAt: "2024-01-01T00:00:00Z",
    },
  ],
  createdAt: "2024-01-01T00:00:00Z",
});

const anchoredAnnotation = (id: string, anchor: string, x: number, y: number): Annotation => ({
  id: annotationId(id),
  elementId: elementId(anchor),
  position: { x, y },
  resolved: false,
  thread: [],
  createdAt: "2024-01-01T00:00:00Z",
});

const sceneWith = (shapes: Element[], annotations: Annotation[]): Scene => {
  let s = emptyScene();
  for (const sh of shapes) s = addElement(s, sh).scene;
  for (const a of annotations) s = addAnnotation(s, a).scene;
  return s;
};

const noopTarget = {
  save: () => {}, restore: () => {}, setTransform: () => {}, clear: () => {},
  setFill: () => {}, setStroke: () => {}, setStrokeWidth: () => {},
  setOpacity: () => {}, setLineCap: () => {}, setLineJoin: () => {},
  setDashArray: () => {}, setFont: () => {}, setTextAlign: () => {},
  setTextBaseline: () => {}, beginPath: () => {}, closePath: () => {},
  moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {},
  bezierCurveTo: () => {}, rect: () => {}, ellipse: () => {},
  fill: () => {}, stroke: () => {}, fillText: () => {},
  measureText: () => ({ width: 0 }), drawImage: () => {},
  translate: () => {}, rotate: () => {}, scale: () => {},
  resetTransform: () => {}, size: { width: 100, height: 100 },
} as never;

const host = {
  addEventListener: () => {}, removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  style: { cursor: "" },
} as never;

const makeEditor = (scene: Scene): Editor =>
  new Editor({ host, mainTarget: noopTarget, overlayTarget: noopTarget, initialScene: scene });

describe("annotation drag", () => {
  it("hitAnnotation resolves a pin under the cursor", () => {
    const e = makeEditor(sceneWith([], [freeAnnotation("a1", 100, 100)]));
    const hit = e.hitAnnotation({ x: 100, y: 100 });
    expect(hit).toBe(annotationId("a1"));
  });

  it("hitAnnotation returns null when far from any pin", () => {
    const e = makeEditor(sceneWith([], [freeAnnotation("a1", 100, 100)]));
    expect(e.hitAnnotation({ x: 1000, y: 1000 })).toBeNull();
  });

  it("MOVE_ANNOTATION emit updates position by delta from origin", () => {
    const e = makeEditor(sceneWith([], [freeAnnotation("a1", 50, 50)]));
    // Simulate the machine's emit handler by directly calling applyEmit
    // — the public surface is `Editor.subscribe` to read after, no need
    // to spin up a full pointer-event harness for the unit.
    (e as unknown as { applyEmit: (e: unknown) => void }).applyEmit({
      type: "MOVE_ANNOTATION",
      id: annotationId("a1"),
      delta: { x: 30, y: -20 },
      originalPosition: { x: 50, y: 50 },
    });
    const ann = e.scene.annotations.get(annotationId("a1"))!;
    expect(ann.position).toEqual({ x: 80, y: 30 });
  });

  it("MOVE_ANNOTATION on anchored annotation stays in shape-local coords", () => {
    const e = makeEditor(
      sceneWith([rect("s1", 100, 100)], [anchoredAnnotation("a1", "s1", 10, 10)]),
    );
    // Element is at (100, 100); annotation offset is (10, 10) so its
    // world position is (110, 110). Drag by world-space (+20, +20).
    // The stored offset becomes (10+20, 10+20) = (30, 30) — local
    // because the editor subtracts the shape's world position.
    (e as unknown as { applyEmit: (e: unknown) => void }).applyEmit({
      type: "MOVE_ANNOTATION",
      id: annotationId("a1"),
      delta: { x: 20, y: 20 },
      originalPosition: { x: 110, y: 110 }, // world space
    });
    const ann = e.scene.annotations.get(annotationId("a1"))!;
    expect(ann.position).toEqual({ x: 30, y: 30 });
  });

  it("COMMIT_ANNOTATION_DRAG closes the gesture into a single undo step", () => {
    const e = makeEditor(sceneWith([], [freeAnnotation("a1", 0, 0)]));
    const before = e.history.size;
    // Two moves (gesture-tick simulation)
    const apply = (e as unknown as { applyEmit: (e: unknown) => void }).applyEmit.bind(e);
    apply({
      type: "MOVE_ANNOTATION",
      id: annotationId("a1"),
      delta: { x: 10, y: 0 },
      originalPosition: { x: 0, y: 0 },
    });
    apply({
      type: "MOVE_ANNOTATION",
      id: annotationId("a1"),
      delta: { x: 20, y: 0 },
      originalPosition: { x: 0, y: 0 },
    });
    apply({ type: "COMMIT_ANNOTATION_DRAG", id: annotationId("a1") });
    const after = e.history.size;
    expect(after - before).toBe(1);
    e.undo();
    expect(e.scene.annotations.get(annotationId("a1"))?.position).toEqual({ x: 0, y: 0 });
  });
});
