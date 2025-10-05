import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Patch,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import {
  findCommonAncestor,
  SnapshotStore,
  mergeBranchHeads,
  threeWayMerge,
} from "../src/index";

const rect = (id: string, x = 0, y = 0, w = 20, h = 20): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: w,
  height: h,
});

const author = { id: "u1", name: "tester" };

const sceneWith = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of elements) {
    s = apply(s, { kind: "element", id: sh.id, before: null, after: sh } satisfies Patch);
  }
  return s;
};

/** Derive a new scene by adding one shape. Preserves identity of existing shapes. */
const addRect = (scene: Scene, id: string, x: number, y: number): Scene => {
  const r = rect(id, x, y);
  return apply(scene, { kind: "element", id: r.id, before: null, after: r } satisfies Patch);
};

const updateRect = (scene: Scene, id: string, x: number, y: number): Scene => {
  const before = scene.elements.get(elementId(id));
  if (!before) throw new Error(`missing shape ${id}`);
  const after = { ...before, position: { x, y } } as Element;
  return apply(scene, { kind: "element", id: elementId(id), before, after } satisfies Patch);
};

describe("merge", () => {
  it("findCommonAncestor walks parent chains across branches", () => {
    const store = new SnapshotStore();
    const base = sceneWith(rect("a"));
    const v1 = store.capture({ scene: base, author, message: "v1" });
    const v2 = store.capture({
      scene: addRect(base, "b", 100, 0),
      author,
      message: "v2",
    });
    const br = store.branch({ name: "feature", fromVersion: v1.id });
    store.setCurrentBranch(br.id);
    const v3 = store.capture({
      scene: addRect(base, "c", 200, 0),
      author,
      message: "v3",
    });
    const ancestor = findCommonAncestor(store, v2.id, v3.id);
    expect(ancestor?.id).toBe(v1.id);
  });

  it("threeWayMerge auto-applies non-conflicting changes", () => {
    const base = sceneWith(rect("a"));
    const source = addRect(base, "b", 10, 0);
    const target = addRect(base, "c", 20, 0);
    const report = threeWayMerge(base, source, target);
    expect(report.conflicts).toHaveLength(0);
    expect(report.mergedScene.elements.has(elementId("a"))).toBe(true);
    expect(report.mergedScene.elements.has(elementId("b"))).toBe(true);
    expect(report.mergedScene.elements.has(elementId("c"))).toBe(true);
  });

  it("threeWayMerge reports both-modified as conflict", () => {
    const base = sceneWith(rect("a", 0));
    const source = updateRect(base, "a", 10, 0);
    const target = updateRect(base, "a", 20, 0);
    const report = threeWayMerge(base, source, target);
    expect(report.conflicts).toHaveLength(1);
    const c = report.conflicts[0]!;
    expect(c.kind).toBe("element");
    expect(c.id).toBe(elementId("a"));
    // Auto-merged value stays at the target value.
    expect((report.mergedScene.elements.get(elementId("a")) as Element).position.x).toBe(20);
  });

  it("mergeBranchHeads runs three-way merge between branch tips", () => {
    const store = new SnapshotStore();
    const base = sceneWith(rect("a", 0));
    const v1 = store.capture({ scene: base, author, message: "v1" });
    const br = store.branch({ name: "feat", fromVersion: v1.id });
    store.setCurrentBranch(br.id);
    const v2 = store.capture({
      scene: addRect(base, "b", 10, 0),
      author,
      message: "v2",
    });
    store.setCurrentBranch(v1.branchId);
    const v3 = store.capture({
      scene: addRect(base, "c", 20, 0),
      author,
      message: "v3",
    });
    const report = mergeBranchHeads(store, v2.id, v3.id);
    expect(report.conflicts).toHaveLength(0);
    expect(report.mergedScene.elements.size).toBe(3);
  });
});
