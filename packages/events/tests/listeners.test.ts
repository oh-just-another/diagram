import { describe, expect, it, vi } from "vitest";
import { createListeners } from "../src/listeners.js";

describe("createListeners", () => {
  it("emit calls every registered listener with the value", () => {
    const l = createListeners<number>();
    const a = vi.fn();
    const b = vi.fn();
    l.add(a);
    l.add(b);
    l.emit(42);
    expect(a).toHaveBeenCalledWith(42);
    expect(b).toHaveBeenCalledWith(42);
  });

  it("add returns an unsubscribe that removes the listener", () => {
    const l = createListeners<number>();
    const fn = vi.fn();
    const off = l.add(fn);
    l.emit(1);
    off();
    l.emit(2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it("size reflects add and unsubscribe", () => {
    const l = createListeners<number>();
    expect(l.size()).toBe(0);
    const off = l.add(vi.fn());
    l.add(vi.fn());
    expect(l.size()).toBe(2);
    off();
    expect(l.size()).toBe(1);
  });

  it("clear drops every listener", () => {
    const l = createListeners<number>();
    const fn = vi.fn();
    l.add(fn);
    l.add(vi.fn());
    l.clear();
    expect(l.size()).toBe(0);
    l.emit(7);
    expect(fn).not.toHaveBeenCalled();
  });

  it("emit snapshots listeners — a listener that unsubscribes itself mid-emit does not break others", () => {
    const l = createListeners<number>();
    const a = vi.fn();
    const handle: { off: () => void } = { off: () => {} };
    const selfRemoving = vi.fn(() => {
      handle.off();
    });
    handle.off = l.add(selfRemoving);
    l.add(a);
    l.emit(1);
    // Both ran on the snapshotted first emit.
    expect(selfRemoving).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledTimes(1);
    // The self-removing listener is gone on the next emit.
    l.emit(2);
    expect(selfRemoving).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledTimes(2);
  });

  it("emit returns nothing useful but invokes listeners in insertion order", () => {
    const l = createListeners<number>();
    const order: number[] = [];
    l.add(() => order.push(1));
    l.add(() => order.push(2));
    l.add(() => order.push(3));
    l.emit(0);
    expect(order).toEqual([1, 2, 3]);
  });

  it("T = void variant emits with no meaningful argument", () => {
    const l = createListeners();
    const fn = vi.fn();
    l.add(fn);
    l.emit();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("registers the same function only once (Set-backed)", () => {
    const l = createListeners<number>();
    const fn = vi.fn();
    l.add(fn);
    l.add(fn);
    expect(l.size()).toBe(1);
    l.emit(9);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("emit with no listeners is a no-op", () => {
    const l = createListeners<number>();
    expect(() => l.emit(1)).not.toThrow();
  });
});
