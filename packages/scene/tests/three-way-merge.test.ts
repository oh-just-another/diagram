import { describe, expect, it } from "vitest";
import { shapeId } from "@oh-just-another/types";
import {
  addShape,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Shape,
} from "../src/index.js";
import {
  applyConflictResolutions,
  mergeScenesThreeWay,
} from "../src/three-way-merge.js";

const rect = (id: string, x: number, y: number): Shape => ({
  id: shapeId(id),
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

const sceneOf = (...shapes: Shape[]): Scene => {
  let s = emptyScene();
  for (const sh of shapes) s = addShape(s, sh).scene;
  return s;
};

describe("mergeScenesThreeWay", () => {
  it("auto-merges non-overlapping adds in source + target", () => {
    const a = rect("a", 0, 0);
    const ancestor = sceneOf(a);
    const source = sceneOf(a, rect("b", 100, 0));
    const target = sceneOf(a, rect("c", 200, 0));
    const report = mergeScenesThreeWay(ancestor, source, target);
    expect(report.conflicts).toEqual([]);
    expect(report.autoMerged.shapes.has(shapeId("a"))).toBe(true);
    expect(report.autoMerged.shapes.has(shapeId("b"))).toBe(true);
    expect(report.autoMerged.shapes.has(shapeId("c"))).toBe(true);
  });

  it("source-only modification auto-applies", () => {
    const a = rect("a", 0, 0);
    const ancestor = sceneOf(a);
    const moved: Shape = { ...a, position: { x: 50, y: 0 } };
    const source = sceneOf(moved);
    const target = sceneOf(a);
    const report = mergeScenesThreeWay(ancestor, source, target);
    expect(report.conflicts).toEqual([]);
    expect(report.autoMerged.shapes.get(shapeId("a"))?.position).toEqual({
      x: 50,
      y: 0,
    });
  });

  it("flags both-modified-differently as a conflict and defaults to target", () => {
    const a = rect("a", 0, 0);
    const ancestor = sceneOf(a);
    const sourceVersion: Shape = { ...a, position: { x: 50, y: 0 } };
    const targetVersion: Shape = { ...a, position: { x: 0, y: 50 } };
    const source = sceneOf(sourceVersion);
    const target = sceneOf(targetVersion);
    const report = mergeScenesThreeWay(ancestor, source, target);
    expect(report.conflicts.length).toBe(1);
    expect(report.conflicts[0]!.shapeId).toBe(shapeId("a"));
    // Default conflict resolution → target wins.
    expect(report.autoMerged.shapes.get(shapeId("a"))?.position).toEqual({
      x: 0,
      y: 50,
    });
  });

  it("applyConflictResolutions can pick `theirs` to override the default", () => {
    const a = rect("a", 0, 0);
    const ancestor = sceneOf(a);
    const sourceVersion: Shape = { ...a, position: { x: 50, y: 0 } };
    const targetVersion: Shape = { ...a, position: { x: 0, y: 50 } };
    const source = sceneOf(sourceVersion);
    const target = sceneOf(targetVersion);
    const report = mergeScenesThreeWay(ancestor, source, target);
    const final = applyConflictResolutions(report, [
      { shapeId: shapeId("a"), choice: "theirs" },
    ]);
    expect(final.shapes.get(shapeId("a"))?.position).toEqual({ x: 50, y: 0 });
  });

  it("`both` keeps target original and duplicates source with -copy suffix", () => {
    const a = rect("a", 0, 0);
    const ancestor = sceneOf(a);
    const sourceVersion: Shape = { ...a, position: { x: 50, y: 0 } };
    const targetVersion: Shape = { ...a, position: { x: 0, y: 50 } };
    const source = sceneOf(sourceVersion);
    const target = sceneOf(targetVersion);
    const report = mergeScenesThreeWay(ancestor, source, target);
    const final = applyConflictResolutions(report, [
      { shapeId: shapeId("a"), choice: "both" },
    ]);
    expect(final.shapes.get(shapeId("a"))?.position).toEqual({ x: 0, y: 50 });
    expect(final.shapes.get(shapeId("a-copy"))?.position).toEqual({ x: 50, y: 0 });
  });

  it("source-only deletion auto-applies when target untouched", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 100, 0);
    const ancestor = sceneOf(a, b);
    const source = sceneOf(a); // b removed
    const target = sceneOf(a, b);
    const report = mergeScenesThreeWay(ancestor, source, target);
    expect(report.conflicts).toEqual([]);
    expect(report.autoMerged.shapes.has(shapeId("b"))).toBe(false);
  });
});
