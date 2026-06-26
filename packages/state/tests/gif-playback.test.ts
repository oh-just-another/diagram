import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ElementId } from "@oh-just-another/types";
import { GifPlaybackController } from "../src/editor/gif-playback.js";
import { GIF_AUTOSTOP_MS } from "../src/constants.js";

const id = (s: string): ElementId => s as ElementId;

describe("GifPlaybackController", () => {
  // The controller reads `performance.now()` for all timing; pin it so tests
  // drive the clock explicitly.
  let now = 1000;

  beforeEach(() => {
    now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { matchMedia?: unknown }).matchMedia;
  });

  const mockReducedMotion = (matches: boolean): void => {
    (globalThis as { matchMedia?: unknown }).matchMedia = vi.fn(() => ({ matches }));
  };

  it("ensure() seeds a shape playing when reduced-motion is off", () => {
    const c = new GifPlaybackController();
    c.ensure(id("a"));
    expect(c.isPaused(id("a"))).toBe(false);
  });

  it("ensure() seeds a shape paused (frozen on frame 0) under reduced-motion", () => {
    mockReducedMotion(true);
    const c = new GifPlaybackController();
    c.ensure(id("a"));
    expect(c.isPaused(id("a"))).toBe(true);
  });

  it("ensure() is idempotent — does not reset existing state", () => {
    const c = new GifPlaybackController();
    c.ensure(id("a"));
    c.toggle(id("a")); // pause
    c.ensure(id("a")); // must not re-seed as playing
    expect(c.isPaused(id("a"))).toBe(true);
  });

  it("clock() returns the play offset while playing and the frozen frame while paused", () => {
    const c = new GifPlaybackController();
    c.ensure(id("a")); // originMs = 1000, playing
    now = 1500;
    expect(c.clock(id("a"))).toBe(500); // now - origin
    c.toggle(id("a")); // pause → frozen at 500
    now = 9999;
    expect(c.clock(id("a"))).toBe(500); // frozen, ignores wall clock
  });

  it("clock() returns wall-clock time for an unmanaged shape", () => {
    const c = new GifPlaybackController();
    now = 4242;
    expect(c.clock(id("ghost"))).toBe(4242);
  });

  it("toggle() pauses a playing shape and resumes it from the frozen frame", () => {
    const c = new GifPlaybackController();
    c.ensure(id("a")); // origin 1000
    now = 1800;
    c.toggle(id("a")); // pause; frozen = 800
    expect(c.isPaused(id("a"))).toBe(true);
    now = 5000;
    c.toggle(id("a")); // resume; origin = now - frozen = 4200
    expect(c.isPaused(id("a"))).toBe(false);
    now = 5500;
    expect(c.clock(id("a"))).toBe(1300); // 5500 - 4200
  });

  it("toggle() on an unmanaged id starts it playing", () => {
    const c = new GifPlaybackController();
    c.toggle(id("a"));
    expect(c.isPaused(id("a"))).toBe(false);
  });

  it("hoverEnter() resumes a paused shape and reports the change", () => {
    const c = new GifPlaybackController();
    c.ensure(id("a"));
    c.toggle(id("a")); // paused
    expect(c.hoverEnter(id("a"))).toBe(true);
    expect(c.isPaused(id("a"))).toBe(false);
  });

  it("hoverEnter() is a no-op (false) when the id is already hovered", () => {
    const c = new GifPlaybackController();
    c.ensure(id("a"));
    c.toggle(id("a"));
    c.hoverEnter(id("a")); // resumes (true)
    expect(c.hoverEnter(id("a"))).toBe(false); // same id, no change
  });

  it("hoverEnter() returns false for a playing shape (nothing to resume)", () => {
    const c = new GifPlaybackController();
    c.ensure(id("a")); // playing
    expect(c.hoverEnter(id("a"))).toBe(false);
  });

  it("autoStopHeavy() freezes a heavy GIF after GIF_AUTOSTOP_MS of play", () => {
    const c = new GifPlaybackController();
    c.ensure(id("a")); // playStartMs = 1000
    now = 1000 + GIF_AUTOSTOP_MS + 1;
    c.autoStopHeavy([id("a")]);
    expect(c.isPaused(id("a"))).toBe(true);
  });

  it("autoStopHeavy() does NOT freeze before the timeout", () => {
    const c = new GifPlaybackController();
    c.ensure(id("a"));
    now = 1000 + GIF_AUTOSTOP_MS - 1;
    c.autoStopHeavy([id("a")]);
    expect(c.isPaused(id("a"))).toBe(false);
  });

  it("autoStopHeavy() keeps a hovered heavy GIF playing past the timeout", () => {
    const c = new GifPlaybackController();
    c.ensure(id("a"));
    c.hoverEnter(id("a")); // mark hovered (already playing)
    now = 1000 + GIF_AUTOSTOP_MS + 1;
    c.autoStopHeavy([id("a")]);
    expect(c.isPaused(id("a"))).toBe(false);
  });
});
