import { describe, expect, it } from "vitest";
import { shapeId } from "@oh-just-another/types";
import * as Selection from "../src/selection";

describe("selection", () => {
  it("EMPTY has no members and is frozen", () => {
    expect(Selection.EMPTY.size).toBe(0);
  });

  it("single creates a selection of one", () => {
    const s = Selection.single(shapeId("a"));
    expect(s.size).toBe(1);
    expect(Selection.has(s, shapeId("a"))).toBe(true);
  });

  it("add is a no-op on duplicate", () => {
    const a = Selection.single(shapeId("a"));
    expect(Selection.add(a, shapeId("a"))).toBe(a);
  });

  it("remove is a no-op when absent", () => {
    const a = Selection.single(shapeId("a"));
    expect(Selection.remove(a, shapeId("b"))).toBe(a);
  });

  it("toggle adds then removes", () => {
    const empty = Selection.EMPTY;
    const added = Selection.toggle(empty, shapeId("a"));
    expect(Selection.has(added, shapeId("a"))).toBe(true);
    const removed = Selection.toggle(added, shapeId("a"));
    expect(Selection.has(removed, shapeId("a"))).toBe(false);
  });

  it("equals compares by set contents", () => {
    const a = new Set([shapeId("x"), shapeId("y")]);
    const b = new Set([shapeId("y"), shapeId("x")]);
    expect(Selection.equals(a, b)).toBe(true);
    expect(Selection.equals(a, new Set([shapeId("x")]))).toBe(false);
  });
});
