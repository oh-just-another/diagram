import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSceneAutosave } from "./autosave";

const DEBOUNCE = 600;

describe("createSceneAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a burst into a single write after the debounce", () => {
    const write = vi.fn();
    const a = createSceneAutosave<string>(write, DEBOUNCE);
    a.schedule("v1");
    a.schedule("v2");
    a.schedule("v3");
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DEBOUNCE);
    expect(write).toHaveBeenCalledTimes(1);
    // latest scene wins
    expect(write).toHaveBeenCalledWith("v3");
  });

  it("flush() persists the pending scene immediately (before the timer fires)", () => {
    // An edit made inside the debounce window must survive a reload /
    // tab-close.
    const write = vi.fn();
    const a = createSceneAutosave<string>(write, DEBOUNCE);
    a.schedule("v1");
    vi.advanceTimersByTime(DEBOUNCE);
    expect(write).toHaveBeenLastCalledWith("v1");

    a.schedule("v2"); // edit inside a fresh debounce window
    expect(write).toHaveBeenCalledTimes(1); // not yet persisted
    a.flush(); // tab hidden / unloading
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith("v2");

    // flushing cancelled the timer — it must not write again.
    vi.advanceTimersByTime(DEBOUNCE);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("flush() is a no-op when nothing is pending", () => {
    const write = vi.fn();
    const a = createSceneAutosave<string>(write, DEBOUNCE);
    a.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("does not write the same pending scene twice across flush + timer", () => {
    const write = vi.fn();
    const a = createSceneAutosave<string>(write, DEBOUNCE);
    a.schedule("v1");
    a.flush();
    expect(write).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(DEBOUNCE);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("cancel() drops the timer without writing", () => {
    const write = vi.fn();
    const a = createSceneAutosave<string>(write, DEBOUNCE);
    a.schedule("v1");
    a.cancel();
    vi.advanceTimersByTime(DEBOUNCE);
    expect(write).not.toHaveBeenCalled();
  });

  it("re-arms after a completed cycle", () => {
    const write = vi.fn();
    const a = createSceneAutosave<string>(write, DEBOUNCE);
    a.schedule("v1");
    vi.advanceTimersByTime(DEBOUNCE);
    a.schedule("v2");
    vi.advanceTimersByTime(DEBOUNCE);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenNthCalledWith(1, "v1");
    expect(write).toHaveBeenNthCalledWith(2, "v2");
  });
});
