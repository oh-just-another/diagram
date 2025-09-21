import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import * as Selection from "../src/selection";

describe("selection", () => {
  it("EMPTY has no members and is frozen", () => {
    expect(Selection.EMPTY.size).toBe(0);
  });

  it("single creates a selection of one", () => {
    const s = Selection.single(elementId("a"));
    expect(s.size).toBe(1);
    expect(Selection.has(s, elementId("a"))).toBe(true);
  });

  it("add is a no-op on duplicate", () => {
    const a = Selection.single(elementId("a"));
    expect(Selection.add(a, elementId("a"))).toBe(a);
  });

  it("remove is a no-op when absent", () => {
    const a = Selection.single(elementId("a"));
    expect(Selection.remove(a, elementId("b"))).toBe(a);
  });

  it("toggle adds then removes", () => {
    const empty = Selection.EMPTY;
    const added = Selection.toggle(empty, elementId("a"));
    expect(Selection.has(added, elementId("a"))).toBe(true);
    const removed = Selection.toggle(added, elementId("a"));
    expect(Selection.has(removed, elementId("a"))).toBe(false);
  });

  it("equals compares by set contents", () => {
    const a = new Set([elementId("x"), elementId("y")]);
    const b = new Set([elementId("y"), elementId("x")]);
    expect(Selection.equals(a, b)).toBe(true);
    expect(Selection.equals(a, new Set([elementId("x")]))).toBe(false);
  });
});
