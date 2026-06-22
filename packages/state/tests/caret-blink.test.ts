import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CaretBlinkController } from "../src/editor/caret-blink.js";
import { CARET_BLINK_INTERVAL_MS } from "../src/constants.js";

describe("CaretBlinkController", () => {
  beforeEach(() => {
    // The blink only runs when a DOM clock (`window`) exists; the test env is
    // node, so fake one in and drive the interval with fake timers.
    (globalThis as { window?: unknown }).window = {};
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { window?: unknown }).window;
  });

  it("starts solid (on = true)", () => {
    const c = new CaretBlinkController(vi.fn());
    expect(c.on).toBe(true);
  });

  it("toggles `on` and fires onTick every CARET_BLINK_INTERVAL_MS", () => {
    const onTick = vi.fn();
    const c = new CaretBlinkController(onTick);
    c.start();
    expect(c.on).toBe(true);
    vi.advanceTimersByTime(CARET_BLINK_INTERVAL_MS);
    expect(c.on).toBe(false);
    expect(onTick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(CARET_BLINK_INTERVAL_MS);
    expect(c.on).toBe(true);
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it("wake() forces the caret back to solid mid-blink", () => {
    const c = new CaretBlinkController(vi.fn());
    c.start();
    vi.advanceTimersByTime(CARET_BLINK_INTERVAL_MS); // on = false
    expect(c.on).toBe(false);
    c.wake();
    expect(c.on).toBe(true);
  });

  it("stop() halts the blink — no further onTick", () => {
    const onTick = vi.fn();
    const c = new CaretBlinkController(onTick);
    c.start();
    c.stop();
    vi.advanceTimersByTime(CARET_BLINK_INTERVAL_MS * 3);
    expect(onTick).not.toHaveBeenCalled();
  });

  it("start() restarts solid and re-arms the timer after a stop", () => {
    const c = new CaretBlinkController(vi.fn());
    c.start();
    vi.advanceTimersByTime(CARET_BLINK_INTERVAL_MS); // off
    expect(c.on).toBe(false);
    c.start(); // restart → solid + fresh timer
    expect(c.on).toBe(true);
    vi.advanceTimersByTime(CARET_BLINK_INTERVAL_MS);
    expect(c.on).toBe(false);
  });

  it("does not arm a timer when window is unavailable (SSR/node)", () => {
    delete (globalThis as { window?: unknown }).window;
    const onTick = vi.fn();
    const c = new CaretBlinkController(onTick);
    c.start();
    vi.advanceTimersByTime(CARET_BLINK_INTERVAL_MS * 3);
    expect(onTick).not.toHaveBeenCalled();
    expect(c.on).toBe(true); // stays solid
  });
});
