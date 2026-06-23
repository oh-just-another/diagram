import { describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { diffMapInto } from "../src/diff-map";

/**
 * Minimal Y.Map-like stand-in exposing only the methods diffMapInto calls
 * (`set` and `delete`), each a vi.fn spy. Cast to Y.Map<V> at the call site.
 */
const fakeTarget = <V>() => {
  const set = vi.fn<(key: string, value: V) => void>();
  const del = vi.fn<(key: string) => void>();
  return {
    target: { set, delete: del } as unknown as Y.Map<V>,
    set,
    delete: del,
  };
};

describe("diffMapInto", () => {
  it("sets keys present in after but absent in before", () => {
    const before = new Map<string, number>();
    const after = new Map<string, number>([["a", 1]]);
    const { target, set, delete: del } = fakeTarget<number>();
    diffMapInto(before, after, target);
    expect(set).toHaveBeenCalledWith("a", 1);
    expect(del).not.toHaveBeenCalled();
  });

  it("sets keys whose value changed (by identity)", () => {
    const before = new Map<string, string>([["a", "old"]]);
    const after = new Map<string, string>([["a", "new"]]);
    const { target, set, delete: del } = fakeTarget<string>();
    diffMapInto(before, after, target);
    expect(set).toHaveBeenCalledWith("a", "new");
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes keys present in before but absent in after", () => {
    const before = new Map<string, number>([["a", 1]]);
    const after = new Map<string, number>();
    const { target, set, delete: del } = fakeTarget<number>();
    diffMapInto(before, after, target);
    expect(del).toHaveBeenCalledWith("a");
    expect(set).not.toHaveBeenCalled();
  });

  it("leaves unchanged keys untouched (same value by identity → no set/delete)", () => {
    const value = { ref: true };
    const before = new Map<string, typeof value>([["a", value]]);
    const after = new Map<string, typeof value>([["a", value]]);
    const { target, set, delete: del } = fakeTarget<typeof value>();
    diffMapInto(before, after, target);
    expect(set).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("re-sets a key whose object reference changed even if structurally equal", () => {
    const before = new Map<string, { x: number }>([["a", { x: 1 }]]);
    const after = new Map<string, { x: number }>([["a", { x: 1 }]]);
    const { target, set } = fakeTarget<{ x: number }>();
    diffMapInto(before, after, target);
    // Identity comparison: different objects → treated as changed.
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("a", after.get("a"));
  });

  it("handles a mixed delta of add, change, delete, and keep", () => {
    const keep = "same";
    const before = new Map<string, string>([
      ["keep", keep],
      ["change", "old"],
      ["drop", "gone"],
    ]);
    const after = new Map<string, string>([
      ["keep", keep],
      ["change", "new"],
      ["add", "fresh"],
    ]);
    const { target, set, delete: del } = fakeTarget<string>();
    diffMapInto(before, after, target);

    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("drop");

    expect(set).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledWith("change", "new");
    expect(set).toHaveBeenCalledWith("add", "fresh");
    expect(set).not.toHaveBeenCalledWith("keep", keep);
  });

  it("does nothing for two empty maps", () => {
    const { target, set, delete: del } = fakeTarget<number>();
    diffMapInto(new Map(), new Map(), target);
    expect(set).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});
