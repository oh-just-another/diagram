import { describe, expect, it } from "vitest";
import {
  ALL_HANDLES,
  CORNER_HANDLES,
  HANDLE_HIT_SLOP,
  HANDLE_OUTSET,
  handlePosition,
  hitHandle,
  resizeBounds,
} from "../src/handle";

const bounds = { x: 0, y: 0, width: 100, height: 50 };

describe("handle positions", () => {
  // At zoom=1 the outset is HANDLE_OUTSET world units. The handles
  // sit outside the bbox so they don't overlap the shape body.
  const o = HANDLE_OUTSET;
  it("nw is top-left, se is bottom-right (offset outward by HANDLE_OUTSET)", () => {
    expect(handlePosition("nw", bounds)).toEqual({ x: -o, y: -o });
    expect(handlePosition("se", bounds)).toEqual({ x: 100 + o, y: 50 + o });
  });
  it("n / s / e / w are midpoints (offset outward)", () => {
    expect(handlePosition("n", bounds)).toEqual({ x: 50, y: -o });
    expect(handlePosition("s", bounds)).toEqual({ x: 50, y: 50 + o });
    expect(handlePosition("e", bounds)).toEqual({ x: 100 + o, y: 25 });
    expect(handlePosition("w", bounds)).toEqual({ x: -o, y: 25 });
  });
  it("zoom keeps the outset constant on screen", () => {
    // At zoom=2 the outset shrinks in world units (3px screen / 2).
    expect(handlePosition("nw", bounds, 2)).toEqual({ x: -o / 2, y: -o / 2 });
  });
  it("ALL_HANDLES has 8 unique entries", () => {
    expect(new Set(ALL_HANDLES).size).toBe(8);
  });
});

describe("hitHandle", () => {
  it("hits the handle within HANDLE_HIT_SLOP tolerance at zoom=1", () => {
    // The nw handle now sits at (-HANDLE_OUTSET, -HANDLE_OUTSET).
    expect(hitHandle({ x: -HANDLE_OUTSET, y: -HANDLE_OUTSET }, bounds, 1)).toBe("nw");
    // Hit-test slop extends `HANDLE_HIT_SLOP` from the handle centre.
    expect(
      hitHandle(
        { x: -HANDLE_OUTSET + HANDLE_HIT_SLOP - 0.5, y: -HANDLE_OUTSET + HANDLE_HIT_SLOP - 0.5 },
        bounds,
        1,
      ),
    ).toBe("nw");
  });
  it("misses when too far", () => {
    expect(hitHandle({ x: 50, y: 25 }, bounds, 1)).toBeNull();
  });
  it("compensates for zoom: handle stays the same screen size", () => {
    // At zoom 4, world tolerance shrinks to HANDLE_HIT_SLOP / 4. Probe
    // DIAGONALLY outside the nw corner (off both edge lines) so the corner's
    // shrunk hit area is what's tested, not an edge.
    const offset = HANDLE_OUTSET / 4; // nw corner world pos at zoom 4
    const tooFar = HANDLE_HIT_SLOP / 4 + 1;
    expect(hitHandle({ x: -offset - tooFar, y: -offset - tooFar }, bounds, 4)).toBeNull();
    expect(hitHandle({ x: -offset, y: -offset }, bounds, 4)).toBe("nw");
  });

  it("an edge is grabbable along the whole side (not just the midpoint)", () => {
    // Edge-midpoint dots were removed; the selection-box side is the target.
    expect(hitHandle({ x: 30, y: 0 }, bounds, 1)).toBe("n"); // top edge, off-centre
    expect(hitHandle({ x: 70, y: 50 }, bounds, 1)).toBe("s"); // bottom edge
    expect(hitHandle({ x: 100, y: 25 }, bounds, 1)).toBe("e"); // right edge
    expect(hitHandle({ x: 0, y: 25 }, bounds, 1)).toBe("w"); // left edge
  });

  it("a corner wins over its adjacent edges", () => {
    expect(hitHandle({ x: -HANDLE_OUTSET, y: -HANDLE_OUTSET }, bounds, 1)).toBe("nw");
  });

  it("CORNER_HANDLES set ignores edge lines (aspect-locked resize)", () => {
    // No edge in the set → a point on the top edge is not a hit.
    expect(hitHandle({ x: 30, y: 0 }, bounds, 1, HANDLE_HIT_SLOP, CORNER_HANDLES)).toBeNull();
    // Corners still hit.
    expect(
      hitHandle(
        { x: -HANDLE_OUTSET, y: -HANDLE_OUTSET },
        bounds,
        1,
        HANDLE_HIT_SLOP,
        CORNER_HANDLES,
      ),
    ).toBe("nw");
  });
});

describe("resizeBounds", () => {
  it("se grows in +x +y", () => {
    expect(resizeBounds(bounds, "se", { x: 10, y: 5 })).toEqual({
      x: 0,
      y: 0,
      width: 110,
      height: 55,
    });
  });
  it("nw shifts origin and shrinks size", () => {
    expect(resizeBounds(bounds, "nw", { x: 5, y: 10 })).toEqual({
      x: 5,
      y: 10,
      width: 95,
      height: 40,
    });
  });
  it("e changes only width", () => {
    const r = resizeBounds(bounds, "e", { x: 7, y: 99 });
    expect(r.width).toBe(107);
    expect(r.height).toBe(50);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });
});
