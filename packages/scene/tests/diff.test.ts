import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  apply,
  DEFAULT_LAYER_ID,
  diffSceneElements,
  emptyScene,
  orderBetween,
  removeElement,
  updateElement,
  type Element,
} from "../src/index";

const rect = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 10,
  height: 10,
});

describe("diffSceneElements", () => {
  it("no changes between identical scenes", () => {
    const s = emptyScene();
    const { scene } = addElement(s, rect("a"));
    const diff = diffSceneElements(scene, scene);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.modified).toEqual([]);
  });

  it("detects added elements", () => {
    const base = emptyScene();
    const { scene: next } = addElement(base, rect("a"));
    const diff = diffSceneElements(base, next);
    expect(diff.added).toContain(elementId("a"));
    expect(diff.removed).toEqual([]);
    expect(diff.modified).toEqual([]);
  });

  it("detects removed elements", () => {
    const { scene: prev } = addElement(emptyScene(), rect("a"));
    const { scene: next } = removeElement(prev, elementId("a"));
    const diff = diffSceneElements(prev, next);
    expect(diff.removed).toContain(elementId("a"));
    expect(diff.added).toEqual([]);
    expect(diff.modified).toEqual([]);
  });

  it("detects modified elements (reference inequality)", () => {
    const { scene: prev } = addElement(emptyScene(), rect("a"));
    const { scene: next } = updateElement(prev, elementId("a"), (s) => ({
      ...s,
      position: { x: 99, y: 99 },
    }));
    const diff = diffSceneElements(prev, next);
    expect(diff.modified).toContain(elementId("a"));
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("detects multiple adds, removes and modifications simultaneously", () => {
    let prev = emptyScene();
    ({ scene: prev } = addElement(prev, rect("keep")));
    ({ scene: prev } = addElement(prev, rect("modify")));
    ({ scene: prev } = addElement(prev, rect("remove")));

    let next = prev;
    ({ scene: next } = addElement(next, rect("added")));
    ({ scene: next } = removeElement(next, elementId("remove")));
    ({ scene: next } = updateElement(next, elementId("modify"), (s) => ({
      ...s,
      position: { x: 1, y: 1 },
    })));

    const diff = diffSceneElements(prev, next);
    expect(diff.added).toContain(elementId("added"));
    expect(diff.removed).toContain(elementId("remove"));
    expect(diff.modified).toContain(elementId("modify"));
    // "keep" element unchanged — not in any list
    expect(diff.added).not.toContain(elementId("keep"));
    expect(diff.removed).not.toContain(elementId("keep"));
    expect(diff.modified).not.toContain(elementId("keep"));
  });

  it("treats same reference as not modified (pure reference equality)", () => {
    const { scene: prev } = addElement(emptyScene(), rect("a"));
    // Re-apply the SAME patch that results in the same object reference:
    const el = prev.elements.get(elementId("a"))!;
    // Build a next scene that has the same object reference for "a"
    const next = apply(prev, {
      kind: "element",
      id: elementId("a"),
      before: el,
      after: el, // same reference
    });
    const diff = diffSceneElements(prev, next);
    // The element wasn't replaced (same ref), so no modification
    expect(diff.modified).not.toContain(elementId("a"));
  });

  it("empty prev → empty next: no diffs", () => {
    const s = emptyScene();
    const diff = diffSceneElements(s, s);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.modified).toEqual([]);
  });

  it("empty prev → populated next: all are added", () => {
    const prev = emptyScene();
    let next = prev;
    ({ scene: next } = addElement(next, rect("x")));
    ({ scene: next } = addElement(next, rect("y")));
    const diff = diffSceneElements(prev, next);
    expect(diff.added.length).toBe(2);
    expect(diff.removed.length).toBe(0);
    expect(diff.modified.length).toBe(0);
  });

  it("populated prev → empty next: all are removed", () => {
    let prev = emptyScene();
    ({ scene: prev } = addElement(prev, rect("x")));
    ({ scene: prev } = addElement(prev, rect("y")));
    let next = prev;
    ({ scene: next } = removeElement(next, elementId("x")));
    ({ scene: next } = removeElement(next, elementId("y")));
    const diff = diffSceneElements(prev, next);
    expect(diff.removed.length).toBe(2);
    expect(diff.added.length).toBe(0);
    expect(diff.modified.length).toBe(0);
  });

  it("reorder (same shape, new object) counts as modified", () => {
    const { scene: prev } = addElement(emptyScene(), rect("a"));
    const el = prev.elements.get(elementId("a"))!;
    // Simulate a reorder: new object with different `order`
    const reordered = { ...el, order: orderBetween(el.order, null) };
    const next = apply(prev, {
      kind: "element",
      id: elementId("a"),
      before: el,
      after: reordered,
    });
    const diff = diffSceneElements(prev, next);
    expect(diff.modified).toContain(elementId("a"));
  });
});
