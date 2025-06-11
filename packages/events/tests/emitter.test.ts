import { describe, expect, it, vi } from "vitest";
import { createEmitter } from "../src/emitter.js";

interface Events {
  ping: () => void;
  mode: (m: "select" | "draw") => void;
  payload: (a: number, b: string) => void;
}

/** vi.fn-based no-op listener — keeps the empty-fn lint rule happy. */
const noop = () => vi.fn();

describe("createEmitter", () => {
  it("delivers payload to subscribed listener", () => {
    const e = createEmitter<Events>();
    const fn = vi.fn();
    e.on("mode", fn);
    expect(e.emit("mode", "select")).toBe(1);
    expect(fn).toHaveBeenCalledWith("select");
  });

  it("forwards multiple arguments in declaration order", () => {
    const e = createEmitter<Events>();
    const fn = vi.fn();
    e.on("payload", fn);
    e.emit("payload", 42, "hello");
    expect(fn).toHaveBeenCalledWith(42, "hello");
  });

  it("returns the count of listeners that ran", () => {
    const e = createEmitter<Events>();
    e.on("ping", noop());
    e.on("ping", noop());
    e.on("ping", noop());
    expect(e.emit("ping")).toBe(3);
  });

  it("emit returns 0 when there are no listeners", () => {
    const e = createEmitter<Events>();
    expect(e.emit("ping")).toBe(0);
  });

  it("on returns an unsubscribe function", () => {
    const e = createEmitter<Events>();
    const fn = vi.fn();
    const off = e.on("ping", fn);
    e.emit("ping");
    off();
    e.emit("ping");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calling unsubscribe twice is a no-op", () => {
    const e = createEmitter<Events>();
    const off = e.on("ping", noop());
    off();
    expect(() => off()).not.toThrow();
    expect(e.listenerCount("ping")).toBe(0);
  });

  it("off removes the listener without affecting siblings", () => {
    const e = createEmitter<Events>();
    const a = vi.fn();
    const b = vi.fn();
    e.on("ping", a);
    e.on("ping", b);
    e.off("ping", a);
    e.emit("ping");
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  it("listenerCount reflects on/off operations", () => {
    const e = createEmitter<Events>();
    expect(e.listenerCount("ping")).toBe(0);
    const off = e.on("ping", noop());
    expect(e.listenerCount("ping")).toBe(1);
    off();
    expect(e.listenerCount("ping")).toBe(0);
  });

  it("clear(event) drops all listeners for that event only", () => {
    const e = createEmitter<Events>();
    e.on("ping", noop());
    e.on("mode", noop());
    e.clear("ping");
    expect(e.listenerCount("ping")).toBe(0);
    expect(e.listenerCount("mode")).toBe(1);
  });

  it("clear() with no argument drops every listener for every event", () => {
    const e = createEmitter<Events>();
    e.on("ping", noop());
    e.on("mode", noop());
    e.clear();
    expect(e.listenerCount("ping")).toBe(0);
    expect(e.listenerCount("mode")).toBe(0);
  });

  it("registers the same function only once per event", () => {
    const e = createEmitter<Events>();
    const fn = vi.fn();
    e.on("ping", fn);
    e.on("ping", fn);
    expect(e.listenerCount("ping")).toBe(1);
    e.emit("ping");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("snapshots listeners — on() inside listener does NOT run this emit", () => {
    const e = createEmitter<Events>();
    const late = vi.fn();
    e.on("ping", () => {
      e.on("ping", late);
    });
    e.emit("ping");
    expect(late).not.toHaveBeenCalled();
    e.emit("ping");
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("off() inside listener does NOT skip already-snapshotted siblings", () => {
    const e = createEmitter<Events>();
    const a = vi.fn();
    const b = vi.fn();
    e.on("ping", () => {
      e.off("ping", b);
    });
    e.on("ping", a);
    e.on("ping", b);
    e.emit("ping");
    // b was already in the snapshot, so it still runs this turn.
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledTimes(1);
    // Next emit reflects the removal.
    e.emit("ping");
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledTimes(2);
  });

  it("does not abort the emit loop on a listener throw", () => {
    const e = createEmitter<Events>();
    const a = vi.fn(() => {
      throw new Error("boom");
    });
    const b = vi.fn();
    e.on("ping", a);
    e.on("ping", b);
    expect(() => e.emit("ping")).toThrow("boom");
    expect(b).toHaveBeenCalled();
  });

  it("re-throws only the FIRST listener error", () => {
    const e = createEmitter<Events>();
    e.on("ping", () => {
      throw new Error("first");
    });
    e.on("ping", () => {
      throw new Error("second");
    });
    expect(() => e.emit("ping")).toThrow("first");
  });
});
