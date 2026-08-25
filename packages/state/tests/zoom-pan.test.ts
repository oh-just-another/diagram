import { describe, expect, it } from "vitest";
import { emptyScene, type Scene } from "@oh-just-another/scene";
import {
  computeResetZoom,
  computeRevealBounds,
  computeRevealNearest,
} from "../src/editor/public/zoom-pan.js";
import { DEFAULT_LAYER_ID, orderBetween, type Element } from "@oh-just-another/scene";
import { elementId } from "@oh-just-another/types";

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

const rect = (id: string, x: number, y: number, w: number, h: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: w,
  height: h,
});

const withElements = (base: Scene, ...els: Element[]): Scene => {
  const elements = new Map(base.elements);
  for (const e of els) elements.set(e.id, e);
  return { ...base, elements };
};

describe("computeRevealNearest", () => {
  const accept = (e: Element) => e.type !== "group";

  it("centres the element nearest the camera and keeps the zoom", () => {
    // Camera centre at world (400, 300); `near` is 100 px away, `far` 5000.
    const before = withElements(
      scene(1, { x: 0, y: 0 }),
      rect("far", 5000, 5000, 20, 20),
      rect("near", 500, 300, 20, 20),
    );
    const next = computeRevealNearest(before, 80, accept);
    expect(next).not.toBeNull();
    expect(next!.viewport.zoom).toBe(1);
    expect(centerWorld(next!.viewport).x).toBeCloseTo(510, 6);
    expect(centerWorld(next!.viewport).y).toBeCloseTo(310, 6);
  });

  it("never zooms in for a lone small shape, zooms out only for an oversized one", () => {
    const small = computeRevealNearest(
      withElements(scene(0.5, { x: 0, y: 0 }), rect("s", 3000, 3000, 10, 10)),
      80,
      accept,
    );
    expect(small!.viewport.zoom).toBe(0.5);
    const big = computeRevealNearest(
      withElements(scene(1, { x: 0, y: 0 }), rect("b", 3000, 3000, 2000, 2000)),
      80,
      accept,
    );
    expect(big!.viewport.zoom).toBeLessThan(1);
  });

  it("is a no-op (null) when nothing qualifies", () => {
    expect(computeRevealNearest(scene(1, { x: 0, y: 0 }), 80, accept)).toBeNull();
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
