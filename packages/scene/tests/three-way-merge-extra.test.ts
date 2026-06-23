import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "../src/index.js";
import { applyConflictResolutions, mergeScenesThreeWay } from "../src/three-way-merge.js";

const rect = (id: string, x: number, y: number): Element => ({
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

const sceneOf = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of elements) s = addElement(s, sh).scene;
  return s;
};

describe("mergeScenesThreeWay — branch coverage", () => {
  // Case 1: no change in either branch (a === s === t) — passthrough, no conflict.
  it("keeps an untouched shape (no change in either branch)", () => {
    const a = rect("a", 0, 0);
    const report = mergeScenesThreeWay(sceneOf(a), sceneOf(a), sceneOf(a));
    expect(report.conflicts).toEqual([]);
    expect(report.autoMerged.elements.get(elementId("a"))).toBe(a);
  });

  // Case 2': only target changed (source equal to ancestor) — keep target.
  it("target-only modification keeps target's version (no conflict)", () => {
    const a = rect("a", 0, 0);
    const targetVersion: Element = { ...a, position: { x: 7, y: 9 } };
    const report = mergeScenesThreeWay(sceneOf(a), sceneOf(a), sceneOf(targetVersion));
    expect(report.conflicts).toEqual([]);
    expect(report.autoMerged.elements.get(elementId("a"))?.position).toEqual({ x: 7, y: 9 });
  });

  // Case 3': target removed, source unchanged — keep the target removal.
  it("target-only deletion is kept when source is untouched", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    // target drops b, source keeps b unchanged.
    const report = mergeScenesThreeWay(sceneOf(a, b), sceneOf(a, b), sceneOf(a));
    expect(report.conflicts).toEqual([]);
    expect(report.autoMerged.elements.has(elementId("b"))).toBe(false);
  });

  // Case 4: same change applied identically in both branches — accept either.
  it("identical change in both branches auto-merges with no conflict", () => {
    const a = rect("a", 0, 0);
    const moved: Element = { ...a, position: { x: 5, y: 5 } };
    // Pass a custom comparator so the two separate `moved` clones count equal.
    const report = mergeScenesThreeWay(sceneOf(a), sceneOf(moved), sceneOf({ ...moved }), {
      compareElements: (x, y) => x.position.x === y.position.x && x.position.y === y.position.y,
    });
    expect(report.conflicts).toEqual([]);
    expect(report.autoMerged.elements.get(elementId("a"))?.position).toEqual({ x: 5, y: 5 });
  });

  // Case 4': both branches removed the same shape.
  it("both-removed auto-merges to a deletion (no conflict)", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const report = mergeScenesThreeWay(sceneOf(a, b), sceneOf(a), sceneOf(a));
    expect(report.conflicts).toEqual([]);
    expect(report.autoMerged.elements.has(elementId("b"))).toBe(false);
  });

  // Case 5': shape added in target only — already present in merged, no conflict.
  it("target-only add is kept (no conflict)", () => {
    const a = rect("a", 0, 0);
    const report = mergeScenesThreeWay(sceneOf(a), sceneOf(a), sceneOf(a, rect("t", 200, 0)));
    expect(report.conflicts).toEqual([]);
    expect(report.autoMerged.elements.has(elementId("t"))).toBe(true);
  });

  // add/add of the SAME id with different content — genuine conflict.
  it("add/add with diverging content is a conflict (base is null)", () => {
    const a = rect("a", 0, 0);
    const sourceAdd = rect("x", 10, 0);
    const targetAdd = rect("x", 0, 10);
    const report = mergeScenesThreeWay(sceneOf(a), sceneOf(a, sourceAdd), sceneOf(a, targetAdd));
    expect(report.conflicts.length).toBe(1);
    expect(report.conflicts[0]!.base).toBeNull();
    expect(report.conflicts[0]!.source?.position).toEqual({ x: 10, y: 0 });
    expect(report.conflicts[0]!.target?.position).toEqual({ x: 0, y: 10 });
    // Default keeps target.
    expect(report.autoMerged.elements.get(elementId("x"))?.position).toEqual({ x: 0, y: 10 });
  });

  // delete-vs-modify: source deletes, target modifies → genuine conflict.
  it("delete-vs-modify is a conflict (source null, target modified)", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const targetMod: Element = { ...b, position: { x: 100, y: 50 } };
    const report = mergeScenesThreeWay(sceneOf(a, b), sceneOf(a), sceneOf(a, targetMod));
    const conflict = report.conflicts.find((c) => c.elementId === elementId("b"));
    expect(conflict).toBeDefined();
    expect(conflict!.source).toBeNull();
    expect(conflict!.target?.position).toEqual({ x: 100, y: 50 });
  });

  describe("applyConflictResolutions — branch coverage", () => {
    // delete-vs-modify conflict resolved "theirs" (source null) → deletion.
    it("`theirs` on a delete-vs-modify conflict removes the element", () => {
      const a = rect("a", 0, 0);
      const b = rect("b", 100, 0);
      const targetMod: Element = { ...b, position: { x: 100, y: 50 } };
      const report = mergeScenesThreeWay(sceneOf(a, b), sceneOf(a), sceneOf(a, targetMod));
      const final = applyConflictResolutions(report, [
        { elementId: elementId("b"), choice: "theirs" },
      ]);
      expect(final.elements.has(elementId("b"))).toBe(false);
    });

    // "ours" with a null target (add-in-source-only-but-conflicting) removes it.
    it("`ours` removes the element when target side is null", () => {
      const a = rect("a", 0, 0);
      // Construct a conflict where target side is null: source modifies,
      // target deletes (mirror of delete-vs-modify).
      const b = rect("b", 100, 0);
      const sourceMod: Element = { ...b, position: { x: 100, y: 50 } };
      const report = mergeScenesThreeWay(sceneOf(a, b), sceneOf(a, sourceMod), sceneOf(a));
      const conflict = report.conflicts.find((c) => c.elementId === elementId("b"));
      expect(conflict?.target).toBeNull();
      const final = applyConflictResolutions(report, [
        { elementId: elementId("b"), choice: "ours" },
      ]);
      expect(final.elements.has(elementId("b"))).toBe(false);
    });

    // "both" where source is null → only the (possibly null) target branch runs,
    // no duplicate created.
    it("`both` with a null source does not create a duplicate", () => {
      const a = rect("a", 0, 0);
      const b = rect("b", 100, 0);
      const targetMod: Element = { ...b, position: { x: 100, y: 50 } };
      const report = mergeScenesThreeWay(sceneOf(a, b), sceneOf(a), sceneOf(a, targetMod));
      const final = applyConflictResolutions(report, [
        { elementId: elementId("b"), choice: "both" },
      ]);
      // Target kept, no -copy because source was null.
      expect(final.elements.get(elementId("b"))?.position).toEqual({ x: 100, y: 50 });
      expect(final.elements.has(elementId("b-copy"))).toBe(false);
    });

    // Resolution referencing an unknown id is skipped (the `if (!c) continue`).
    it("skips resolutions for ids that are not conflicts", () => {
      const a = rect("a", 0, 0);
      const report = mergeScenesThreeWay(sceneOf(a), sceneOf(a), sceneOf(a));
      const final = applyConflictResolutions(report, [
        { elementId: elementId("ghost"), choice: "theirs" },
      ]);
      expect(final.elements.size).toBe(1);
      expect(final.elements.has(elementId("ghost"))).toBe(false);
    });

    // Custom cloneWithNewId is honoured by the "both" path.
    it("`both` uses a custom cloneWithNewId for the duplicate", () => {
      const a = rect("a", 0, 0);
      const sourceVersion: Element = { ...a, position: { x: 50, y: 0 } };
      const targetVersion: Element = { ...a, position: { x: 0, y: 50 } };
      const report = mergeScenesThreeWay(
        sceneOf(a),
        sceneOf(sourceVersion),
        sceneOf(targetVersion),
      );
      const final = applyConflictResolutions(
        report,
        [{ elementId: elementId("a"), choice: "both" }],
        (shape) => ({ ...shape, id: elementId(`${shape.id}-dup`) }),
      );
      expect(final.elements.has(elementId("a-dup"))).toBe(true);
      expect(final.elements.has(elementId("a-copy"))).toBe(false);
    });
  });
});
