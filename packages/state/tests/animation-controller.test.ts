import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AnimationController, type AnimationHost } from "../src/editor/animation.js";
import { ANIMATION_MIN_INTERVAL_MS } from "../src/constants.js";

/** Synchronous fake rAF/cancel on globalThis with a manual `flush()`. */
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
  const flush = (limit = 50): void => {
    let n = 0;
    while (pending.size > 0 && n++ < limit) {
      const [id, cb] = [...pending.entries()][0]!;
      pending.delete(id);
      cb(performance.now());
    }
  };
  Object.assign(globalThis, { requestAnimationFrame, cancelAnimationFrame });
  const restore = (): void => {
    // @ts-expect-error -- intentional teardown
    delete globalThis.requestAnimationFrame;
    // @ts-expect-error -- intentional teardown
    delete globalThis.cancelAnimationFrame;
  };
  return { flush, restore };
};

const makeHost = (
  visible: boolean,
): AnimationHost & {
  autoStopHeavyGifs: ReturnType<typeof vi.fn>;
  forceAnimationRepaint: ReturnType<typeof vi.fn>;
} => ({
  hasVisibleAnimatedElement: () => visible,
  autoStopHeavyGifs: vi.fn(),
  forceAnimationRepaint: vi.fn(),
});

describe("AnimationController", () => {
  let raf: ReturnType<typeof installFakeRaf>;
  let now = 1000;

  beforeEach(() => {
    now = 1000;
    raf = installFakeRaf();
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    raf.restore();
    vi.restoreAllMocks();
  });

  it("maybe() does not arm the tick when nothing animated is visible", () => {
    const host = makeHost(false);
    const c = new AnimationController(host);
    c.maybe();
    raf.flush();
    expect(host.forceAnimationRepaint).not.toHaveBeenCalled();
  });

  it("maybe() arms the tick and a frame drives auto-stop + repaint", () => {
    const host = makeHost(true);
    const c = new AnimationController(host);
    c.maybe();
    raf.flush(1);
    expect(host.autoStopHeavyGifs).toHaveBeenCalledTimes(1);
    expect(host.forceAnimationRepaint).toHaveBeenCalledTimes(1);
  });

  it("throttles a second frame that fires too soon", () => {
    const host = makeHost(true);
    const c = new AnimationController(host);
    c.maybe();
    raf.flush(1); // first frame: repaint (lastTickMs = now)
    expect(host.forceAnimationRepaint).toHaveBeenCalledTimes(1);
    // Same wall-clock → within the throttle interval → skipped.
    raf.flush(1);
    expect(host.forceAnimationRepaint).toHaveBeenCalledTimes(1);
  });

  it("repaints again once the throttle interval has elapsed", () => {
    const host = makeHost(true);
    const c = new AnimationController(host);
    c.maybe();
    raf.flush(1);
    expect(host.forceAnimationRepaint).toHaveBeenCalledTimes(1);
    now += ANIMATION_MIN_INTERVAL_MS + 1;
    raf.flush(1);
    expect(host.forceAnimationRepaint).toHaveBeenCalledTimes(2);
  });

  it("detach() stops the tick — no further frames repaint", () => {
    const host = makeHost(true);
    const c = new AnimationController(host);
    c.maybe();
    c.detach();
    raf.flush();
    expect(host.forceAnimationRepaint).not.toHaveBeenCalled();
  });
});
