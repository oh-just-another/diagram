import { describe, expect, it } from "vitest";
import { emptyScene, type Scene } from "@oh-just-another/scene";
import { computeResetZoom } from "../src/editor/public/zoom-pan.js";

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
