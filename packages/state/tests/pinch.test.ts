import { describe, expect, it } from "vitest";
import { matrix } from "@oh-just-another/math";
import {
  DEFAULT_VIEWPORT,
  getScreenToWorld,
  getWorldToScreen,
  panBy,
  zoomAt,
  type Viewport,
} from "@oh-just-another/scene";
import type { Vec2 } from "@oh-just-another/types";
import { PinchController } from "../src/editor/pinch.js";
import { PINCH_MIN_MOVEMENT_PX } from "../src/constants.js";

/**
 * PinchController drives two-finger zoom + pan through the same viewport
 * math the renderer and hit-test use. The invariant that matters for touch
 * correctness: the world point under the fingers' start midpoint stays under
 * the fingers as they pinch / drag (content follows the fingers). If this
 * drifts, tapping after a pinch lands away from where shapes appear.
 */

// Mutable-camera harness wiring the controller's callbacks to the real
// scene viewport functions — exactly how the editor wires them.
const makeHarness = (initial?: Partial<Viewport>) => {
  let camera: Viewport = {
    ...DEFAULT_VIEWPORT,
    size: { width: 1024, height: 768 },
    ...initial,
  };
  const s2w = (p: Vec2): Vec2 => matrix.applyToPoint(getScreenToWorld(camera), p);
  const w2s = (p: Vec2): Vec2 => matrix.applyToPoint(getWorldToScreen(camera), p);
  const pc = new PinchController(
    s2w,
    (factor, anchorWorld) => {
      camera = zoomAt(camera, factor, anchorWorld);
    },
    (delta) => {
      camera = panBy(camera, delta);
    },
  );
  return { pc, s2w, w2s, camera: () => camera };
};

const close = (a: number, b: number, eps = 1e-3): boolean => Math.abs(a - b) < eps;

describe("PinchController", () => {
  it("pure zoom: world point under the midpoint stays under it; zoom scales by distance ratio", () => {
    for (const startZoom of [0.5, 1, 3]) {
      const h = makeHarness({ zoom: startZoom, pan: { x: 20, y: -10 } });
      // Fingers centred at (400, 300), 100px apart.
      h.pc.begin([
        { x: 350, y: 300 },
        { x: 450, y: 300 },
      ]);
      const mid = { x: 400, y: 300 };
      const worldUnderMid = h.s2w(mid);
      // Spread to 200px apart, same midpoint → 2× zoom, no pan.
      h.pc.apply([
        { x: 300, y: 300 },
        { x: 500, y: 300 },
      ]);
      expect(close(h.camera().zoom, startZoom * 2, 1e-6)).toBe(true);
      // The captured world point is still rendered under the midpoint.
      const nowAt = h.w2s(worldUnderMid);
      expect(close(nowAt.x, mid.x)).toBe(true);
      expect(close(nowAt.y, mid.y)).toBe(true);
    }
  });

  it("combined zoom + pan applies both (pins the current mapping)", () => {
    // A frame zooms around the current midpoint (M1) then translates by
    // (M1 − M0). For a probe at screen x_before the result is
    // `M1 + (x_before − M1)·f + (M1 − M0)`. The world point under the start
    // midpoint (M0) does not stick to the fingers' new midpoint; it lands
    // back at M0.
    const h = makeHarness({ zoom: 1.5, pan: { x: 0, y: 0 } });
    h.pc.begin([
      { x: 300, y: 300 },
      { x: 400, y: 300 },
    ]);
    const M0 = { x: 350, y: 300 };
    const worldUnderStart = h.s2w(M0);
    // Move both fingers right AND spread: midpoint 350 → 480, distance 100 → 160.
    h.pc.apply([
      { x: 400, y: 300 },
      { x: 560, y: 300 },
    ]);
    const f = 160 / 100;
    expect(close(h.camera().zoom, 1.5 * f, 1e-6)).toBe(true);
    // Apply the derived formula at x_before = M0.x (=350), M1.x = 480.
    const expectedX = 480 + (350 - 480) * f + (480 - 350);
    const nowAt = h.w2s(worldUnderStart);
    expect(close(nowAt.x, expectedX, 1e-2)).toBe(true);
    expect(close(nowAt.y, M0.y, 1e-2)).toBe(true);
  });

  it("ignores sub-threshold jitter (resting fingers don't drift the camera)", () => {
    const h = makeHarness();
    h.pc.begin([
      { x: 300, y: 300 },
      { x: 400, y: 300 },
    ]);
    const before = h.camera();
    const nudge = PINCH_MIN_MOVEMENT_PX / 4;
    h.pc.apply([
      { x: 300 + nudge, y: 300 },
      { x: 400, y: 300 },
    ]);
    expect(h.camera()).toBe(before); // identical ref — no zoom/pan applied
  });

  it("begin is a no-op with fewer than two fingers; apply before begin does nothing", () => {
    const h = makeHarness();
    h.pc.apply([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(h.pc.isActive()).toBe(false);
    h.pc.begin([{ x: 0, y: 0 }]);
    expect(h.pc.isActive()).toBe(false);
  });
});
