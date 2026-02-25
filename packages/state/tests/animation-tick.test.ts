import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AnimationTick } from "../src/animation-tick.js";

// ---------------------------------------------------------------------------
// Fake rAF helpers
// ---------------------------------------------------------------------------

/**
 * Install a synchronous fake requestAnimationFrame / cancelAnimationFrame
 * on globalThis. Returns a `flush()` helper that runs queued frames, and
 * a `restore()` helper that removes the stubs.
 */
const installFakeRaf = () => {
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();

  const requestAnimationFrame = vi.fn((cb: FrameRequestCallback): number => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  });

  const cancelAnimationFrame = vi.fn((id: number): void => {
    pending.delete(id);
  });

  // Drain up to `limit` pending frames (safety cap to avoid infinite loops).
  const flush = (limit = 100): void => {
    let n = 0;
    while (pending.size > 0 && n++ < limit) {
      const [id, cb] = [...pending.entries()][0]!;
      pending.delete(id);
      cb(performance.now());
    }
  };

  Object.assign(globalThis, { requestAnimationFrame, cancelAnimationFrame });

  const restore = () => {
    // @ts-expect-error -- delete is intentional for test teardown
    delete globalThis.requestAnimationFrame;
    // @ts-expect-error -- delete is intentional for test teardown
    delete globalThis.cancelAnimationFrame;
  };

  return { requestAnimationFrame, cancelAnimationFrame, flush, restore };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AnimationTick", () => {
  let raf: ReturnType<typeof installFakeRaf>;

  beforeEach(() => {
    raf = installFakeRaf();
  });

  afterEach(() => {
    raf.restore();
  });

  // --- initial state ---

  it("is not running before start() is called", () => {
    const tick = new AnimationTick({ isAnimated: () => false, onTick: vi.fn() });
    expect(tick.running).toBe(false);
  });

  // --- start / running ---

  it("running becomes true immediately after start()", () => {
    const tick = new AnimationTick({ isAnimated: () => true, onTick: vi.fn() });
    tick.start();
    expect(tick.running).toBe(true);
  });

  it("calls requestAnimationFrame once when started", () => {
    const tick = new AnimationTick({ isAnimated: () => true, onTick: vi.fn() });
    tick.start();
    expect(raf.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it("start() is a no-op when already running", () => {
    const tick = new AnimationTick({ isAnimated: () => true, onTick: vi.fn() });
    tick.start();
    tick.start();
    expect(raf.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  // --- tick callbacks ---

  it("calls onTick each time a frame fires while isAnimated() is true", () => {
    const onTick = vi.fn();
    const tick = new AnimationTick({ isAnimated: () => true, onTick });
    tick.start();
    raf.flush(3); // flush 3 frames
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  // --- self-termination ---

  it("stops the loop when isAnimated() returns false", () => {
    const onTick = vi.fn();
    let animated = true;
    const tick = new AnimationTick({ isAnimated: () => animated, onTick });
    tick.start();
    raf.flush(1); // first frame fires, onTick called
    animated = false;
    raf.flush(1); // second frame fires, isAnimated=false → loop stops
    const callsAfterStop = onTick.mock.calls.length;
    raf.flush(5); // no more frames should be pending
    expect(onTick).toHaveBeenCalledTimes(callsAfterStop);
    expect(tick.running).toBe(false);
  });

  it("running is false after the loop self-terminates", () => {
    let animated = true;
    const tick = new AnimationTick({ isAnimated: () => animated, onTick: vi.fn() });
    tick.start();
    animated = false;
    raf.flush(2);
    expect(tick.running).toBe(false);
  });

  it("can be restarted after self-termination", () => {
    const onTick = vi.fn();
    let animated = true;
    const tick = new AnimationTick({ isAnimated: () => animated, onTick });
    tick.start();
    animated = false;
    raf.flush(2); // let it stop
    expect(tick.running).toBe(false);

    // Restart
    animated = true;
    tick.start();
    expect(tick.running).toBe(true);
    raf.flush(2);
    expect(onTick.mock.calls.length).toBeGreaterThan(0);
  });

  // --- stop() ---

  it("stop() cancels the pending frame and sets running to false", () => {
    const tick = new AnimationTick({ isAnimated: () => true, onTick: vi.fn() });
    tick.start();
    expect(tick.running).toBe(true);
    tick.stop();
    expect(tick.running).toBe(false);
    expect(raf.cancelAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it("stop() is a no-op when not running", () => {
    const tick = new AnimationTick({ isAnimated: () => true, onTick: vi.fn() });
    tick.stop(); // no-op: not started
    expect(raf.cancelAnimationFrame).not.toHaveBeenCalled();
  });

  it("after stop(), flushing the queue does not call onTick", () => {
    const onTick = vi.fn();
    const tick = new AnimationTick({ isAnimated: () => true, onTick });
    tick.start();
    tick.stop();
    raf.flush(5);
    expect(onTick).not.toHaveBeenCalled();
  });

  // --- SSR safety ---

  it("start() is a no-op when requestAnimationFrame is unavailable (SSR)", () => {
    raf.restore(); // remove the fake — now rAF is undefined
    const tick = new AnimationTick({ isAnimated: () => true, onTick: vi.fn() });
    expect(() => tick.start()).not.toThrow();
    expect(tick.running).toBe(false);
    // Re-install for afterEach to clean up gracefully
    raf = installFakeRaf();
  });
});
