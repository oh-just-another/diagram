import { describe, expect, it } from "vitest";
import { emptyScene, type Scene } from "@oh-just-another/scene";
import { computeResetZoom, computeRevealBounds } from "../src/editor/public/zoom-pan.js";

/** Scene with an explicit panned + zoomed camera of a known size. */
const scene = (zoom: number, pan: { x: number; y: number }): Scene => ({
  ...emptyScene(),
  viewport: {
    pan,
    zoom,
    rotation: 0,
    size: { width: 800, height: 600 },
    gridEnabled: false,
  },
});

/** World coordinate currently under the screen center, given a viewport. */
const centerWorld = (vp: Scene["viewport"]) => ({
  x: vp.pan.x + vp.size.width / 2 / vp.zoom,
  y: vp.pan.y + vp.size.height / 2 / vp.zoom,
});

describe("computeResetZoom", () => {
  it("resets zoom to 1 while keeping the viewport center focal point", () => {
    const before = scene(2.4, { x: 1000, y: -500 });
    const focal = centerWorld(before.viewport);

    const next = computeResetZoom(before);
    expect(next).not.toBeNull();
    const vp = next!.viewport;

    expect(vp.zoom).toBe(1);
    // The world point under the screen center is unchanged; pan is
    // recomputed rather than zeroed.
    expect(centerWorld(vp).x).toBeCloseTo(focal.x, 6);
    expect(centerWorld(vp).y).toBeCloseTo(focal.y, 6);
    // The pan itself must NOT be (0,0) for a panned scene.
    expect(vp.pan.x === 0 && vp.pan.y === 0).toBe(false);
  });

  it("is a no-op (null) when already at zoom 1", () => {
    expect(computeResetZoom(scene(1, { x: 123, y: 456 }))).toBeNull();
  });

  it("resets zoom even when pan is already at the origin", () => {
    const next = computeResetZoom(scene(3, { x: 0, y: 0 }));
    expect(next).not.toBeNull();
    expect(next!.viewport.zoom).toBe(1);
  });
});

describe("computeRevealBounds", () => {
  it("keeps the current zoom for a small match and just centers it", () => {
    const before = scene(1, { x: 0, y: 0 });
    // A tiny 20×20 match somewhere off-center.
    const next = computeRevealBounds(before, { x: 500, y: 400, width: 20, height: 20 }, 80);
    expect(next).not.toBeNull();
    const vp = next!.viewport;
    // Zoom is NOT changed — the small match must not fill the screen.
    expect(vp.zoom).toBe(1);
    // The match center sits under the screen center.
    expect(centerWorld(vp).x).toBeCloseTo(510, 6);
    expect(centerWorld(vp).y).toBeCloseTo(410, 6);
  });

  it("does not zoom IN even when the match is far smaller than the viewport", () => {
    const before = scene(0.5, { x: 0, y: 0 });
    const next = computeRevealBounds(before, { x: 0, y: 0, width: 10, height: 10 }, 80);
    expect(next!.viewport.zoom).toBe(0.5); // preserved, not increased
  });

  it("zooms OUT to fit a match larger than the viewport", () => {
    const before = scene(1, { x: 0, y: 0 });
    // 2000×2000 match can't fit an 800×600 viewport at zoom 1.
    const next = computeRevealBounds(before, { x: 0, y: 0, width: 2000, height: 2000 }, 80);
    const vp = next!.viewport;
    expect(vp.zoom).toBeLessThan(1);
    // Fits within the padded viewport.
    expect(2000 * vp.zoom).toBeLessThanOrEqual(600 - 80 * 2 + 1e-6);
  });

  it("returns null on degenerate bounds", () => {
    expect(
      computeRevealBounds(scene(1, { x: 0, y: 0 }), { x: 0, y: 0, width: 0, height: 5 }, 80),
    ).toBeNull();
  });
});
