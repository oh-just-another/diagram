import { describe, expect, it, vi } from "vitest";
import { LruCache } from "../src/lru-cache";

describe("LruCache", () => {
  it("set/get/has/size on a fresh cache", () => {
    const cache = new LruCache<string, number>(4);
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.has("a")).toBe(false);

    cache.set("a", 1);
    expect(cache.size).toBe(1);
    expect(cache.has("a")).toBe(true);
    expect(cache.get("a")).toBe(1);
  });

  it("delete removes an entry and reports whether it existed", () => {
    const cache = new LruCache<string, number>(4);
    cache.set("a", 1);
    expect(cache.delete("a")).toBe(true);
    expect(cache.has("a")).toBe(false);
    expect(cache.size).toBe(0);
    // deleting a missing key returns false
    expect(cache.delete("a")).toBe(false);
  });

  it("clear empties the cache", () => {
    const cache = new LruCache<string, number>(4);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(false);
  });

  it("keys() and values() iterate in insertion order", () => {
    const cache = new LruCache<string, number>(4);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect([...cache.keys()]).toEqual(["a", "b", "c"]);
    expect([...cache.values()]).toEqual([1, 2, 3]);
  });

  it("evicts the least-recently-USED entry past capacity (no get)", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3); // exceeds cap → oldest (a) evicted
    expect(cache.size).toBe(2);
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("get() promotes recency so a different entry is evicted", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    // touch "a" → "b" becomes least-recently-used
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3); // exceeds cap → b evicted, a survives
    expect(cache.size).toBe(2);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
    // recency order is reflected in iteration
    expect([...cache.keys()]).toEqual(["a", "c"]);
  });

  it("set on an existing key updates the value and promotes it", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10); // update + promote → "b" now least-recently-used
    expect(cache.get("a")).toBe(10);
    expect([...cache.keys()]).toEqual(["b", "a"]);

    cache.set("c", 3); // exceeds cap → b evicted
    expect(cache.has("b")).toBe(false);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("fires onEvict with the evicted (key, value) when provided", () => {
    const onEvict = vi.fn<(key: string, value: number) => void>();
    const cache = new LruCache<string, number>(2, onEvict);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(onEvict).not.toHaveBeenCalled();

    cache.set("c", 3); // evicts a
    expect(onEvict).toHaveBeenCalledTimes(1);
    expect(onEvict).toHaveBeenCalledWith("a", 1);
  });

  it("fires onEvict for each entry dropped on overflow", () => {
    const onEvict = vi.fn<(key: string, value: number) => void>();
    const cache = new LruCache<string, number>(1, onEvict);
    cache.set("a", 1);
    cache.set("b", 2); // evicts a
    cache.set("c", 3); // evicts b
    expect(onEvict.mock.calls).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("does not fire onEvict on explicit delete or clear", () => {
    const onEvict = vi.fn();
    const cache = new LruCache<string, number>(4, onEvict);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.delete("a");
    cache.clear();
    expect(onEvict).not.toHaveBeenCalled();
  });
});
