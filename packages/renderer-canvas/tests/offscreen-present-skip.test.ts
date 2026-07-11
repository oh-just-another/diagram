import { describe, expect, it, vi } from "vitest";
import { createLayeredSurface } from "../src/layered-surface";

/**
 * Exercises `OffscreenLayeredSurface.present()`'s skip-unchanged path
 * without a real DOM / worker: canvases and workers are stubbed so we can
 * count the `replay` messages posted per frame. Real GL / worker replay is
 * verified manually in the demo.
 */

interface StubWorker {
  onerror: ((e: unknown) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
}

const makeCanvasStub = (): HTMLCanvasElement =>
  ({
    width: 0,
    height: 0,
    style: { width: "", height: "", position: "", inset: "", pointerEvents: "" },
    dataset: {},
    getContext: vi.fn(() => null),
    appendChild: vi.fn(),
    remove: vi.fn(),
    transferControlToOffscreen: vi.fn(() => ({}) as unknown as OffscreenCanvas),
  }) as unknown as HTMLCanvasElement;

const makeHostStub = (): HTMLElement =>
  ({
    ownerDocument: { createElement: vi.fn(() => makeCanvasStub()) },
    appendChild: vi.fn(),
    style: { position: "" },
  }) as unknown as HTMLElement;

const beforeAll = (): void => {
  const g = globalThis as unknown as { getComputedStyle?: unknown; window?: unknown };
  if (typeof g.getComputedStyle !== "function") {
    g.getComputedStyle = () => ({ position: "relative" });
  }
  if (typeof g.window === "undefined") g.window = { devicePixelRatio: 1 };
};
beforeAll();

const buildOffscreen = () => {
  const workers: StubWorker[] = [];
  const workerFactory = (): Worker => {
    const w: StubWorker = { onerror: null, postMessage: vi.fn(), terminate: vi.fn() };
    workers.push(w);
    return w as unknown as Worker;
  };
  const surface = createLayeredSurface(makeHostStub(), 100, 100, {
    backend: "offscreen",
    workerFactory,
  });
  const replaysFor = (w: StubWorker): number =>
    w.postMessage.mock.calls.filter((c) => (c[0] as { type?: string }).type === "replay").length;
  const replayCounts = (): number => workers.reduce((n, w) => n + replaysFor(w), 0);
  // LAYER_ORDER = ["background", "main", "overlay"] → worker index per layer.
  return { surface, replayCounts, replaysFor, workers };
};

describe("OffscreenLayeredSurface.present skip-unchanged", () => {
  it("posts a replay only when a layer's command stream changes", () => {
    const { surface, replayCounts } = buildOffscreen();
    const main = surface.get("main");

    // Frame 1: content recorded → one replay.
    main.setFill("red");
    main.beginPath();
    main.rect(0, 0, 10, 10);
    main.fill();
    surface.present();
    expect(replayCounts()).toBe(1);

    // Frame 2: identical stream → skipped, still 1.
    main.setFill("red");
    main.beginPath();
    main.rect(0, 0, 10, 10);
    main.fill();
    surface.present();
    expect(replayCounts()).toBe(1);

    // Frame 3: a coordinate changes → reposts, now 2.
    main.setFill("red");
    main.beginPath();
    main.rect(0, 0, 10, 11);
    main.fill();
    surface.present();
    expect(replayCounts()).toBe(2);
  });

  it("skips clean layers while only one layer changes each frame", () => {
    const { surface, replayCounts } = buildOffscreen();
    const bg = surface.get("background");
    const main = surface.get("main");

    // Frame 1: both layers draw → two replays.
    bg.rect(0, 0, 100, 100);
    main.rect(0, 0, 10, 10);
    surface.present();
    expect(replayCounts()).toBe(2);

    // Frame 2: background identical, main advances → one more replay (3).
    bg.rect(0, 0, 100, 100);
    main.rect(0, 0, 10, 20);
    surface.present();
    expect(replayCounts()).toBe(3);
  });

  it("reposts a layer after a resize even when its content signature repeats", () => {
    const { surface, replaysFor, workers } = buildOffscreen();
    const mainWorker = workers[1]!; // LAYER_ORDER index of "main"
    const main = surface.get("main");
    main.rect(0, 0, 10, 10);
    surface.present();
    expect(replaysFor(mainWorker)).toBe(1);

    // Identical content twice → second frame skipped.
    main.rect(0, 0, 10, 10);
    surface.present();
    expect(replaysFor(mainWorker)).toBe(1);

    // A resize clears the worker canvas and drops the signature cache, so
    // the first frame after it always reposts.
    surface.resize(200, 200);
    main.rect(0, 0, 10, 10);
    surface.present();
    expect(replaysFor(mainWorker)).toBe(2);
  });
});
