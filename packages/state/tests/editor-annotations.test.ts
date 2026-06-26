import { describe, expect, it } from "vitest";
import { annotationId, commentId, elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

// Exercises the annotation / comment public API on the editor (CRUD + the
// live-region announcements), which the existing annotation-drag test doesn't
// touch (it only covers hit-testing and the MOVE_ANNOTATION gesture).

const rect = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 50,
  height: 50,
});

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

describe("editor annotations & comments", () => {
  it("add / comment / remove-comment / resolve / remove, with announcements", () => {
    const e = editorWith(sceneWith(rect("a")));
    const announced: string[] = [];
    const off = e.onAnnounce((m) => announced.push(m));
    e.setCommentAuthor({ id: "u1", name: "Alice" });

    const id = e.addAnnotation({ position: { x: 10, y: 10 }, firstComment: "hi" });
    expect(e.selectedAnnotation).toBe(id);
    expect(e.scene.annotations.has(id)).toBe(true);
    expect(announced).toContain("Annotation added");

    const n0 = e.scene.annotations.get(id)!.thread.length;
    e.addComment(id, "second");
    const ann = e.scene.annotations.get(id)!;
    expect(ann.thread.length).toBe(n0 + 1);

    e.removeComment(id, ann.thread[0]!.id);
    expect(e.scene.annotations.get(id)!.thread.length).toBe(n0);

    e.toggleAnnotationResolved(id);
    expect(e.scene.annotations.get(id)!.resolved).toBe(true);
    expect(announced).toContain("Annotation resolved");
    e.toggleAnnotationResolved(id);
    expect(e.scene.annotations.get(id)!.resolved).toBe(false);
    expect(announced).toContain("Annotation reopened");

    e.setSelectedAnnotation(null);
    expect(e.selectedAnnotation).toBeNull();

    e.removeAnnotation(id);
    expect(e.scene.annotations.has(id)).toBe(false);
    expect(announced).toContain("Annotation removed");
    off();
  });

  it("hit-tests a pin and no-ops on unknown ids", () => {
    const e = editorWith(sceneWith(rect("a")));
    const id = e.addAnnotation({ position: { x: 40, y: 40 } });
    expect(e.hitAnnotation({ x: 40, y: 40 })).toBe(id);
    expect(e.hitAnnotation({ x: 999, y: 999 })).toBeNull();

    // Unknown-id paths short-circuit (the `if (!result) return` branches).
    e.removeAnnotation(annotationId("nope"));
    e.toggleAnnotationResolved(annotationId("nope"));
    e.removeComment(annotationId("nope"), commentId("x"));
    e.addComment(annotationId("nope"), "x");
    expect(e.scene.annotations.has(id)).toBe(true);
  });
});
