import { describe, expect, it } from "vitest";
import type { Bounds, ElementId, Vec2 } from "@oh-just-another/types";
import {
  snapCreateBounds,
  snapGroupDelta,
  snapMoveDelta,
  snapPointToGrid,
  snapResizeDelta,
} from "../src/editor/applies/snap-grid.js";

const SPACING = 20;

describe("snapPointToGrid", () => {
  it("rounds to the nearest multiple of spacing", () => {
    expect(snapPointToGrid({ x: 23, y: 17 }, SPACING)).toEqual({ x: 20, y: 20 });
    expect(snapPointToGrid({ x: 31, y: 9 }, SPACING)).toEqual({ x: 40, y: 0 });
    expect(snapPointToGrid({ x: -7, y: -13 }, SPACING)).toEqual({ x: -0, y: -20 });
  });
});

describe("snapMoveDelta", () => {
  const bounds: Bounds = { x: 13, y: 27, width: 50, height: 40 };

  it("snaps the press-time top-left onto the grid", () => {
    // top-left starts at (13,27); moving by (10,10) -> (23,37) -> snaps to (20,40)
    const d = snapMoveDelta(bounds, { x: 10, y: 10 }, SPACING);
    expect(bounds.x + d.x).toBe(20);
    expect(bounds.y + d.y).toBe(40);
  });

  it("an off-grid shape with zero drag is pulled to the nearest node", () => {
    const d = snapMoveDelta(bounds, { x: 0, y: 0 }, SPACING);
    expect(bounds.x + d.x).toBe(20); // 13 -> 20
    expect(bounds.y + d.y).toBe(20); // 27 -> 20
  });
});

describe("snapGroupDelta", () => {
  it("snaps the group's min corner, preserving relative offsets", () => {
    const origins = new Map<ElementId, Vec2>([
      ["a" as ElementId, { x: 13, y: 27 }],
      ["b" as ElementId, { x: 113, y: 67 }],
    ]);
    const d = snapGroupDelta(origins, { x: 10, y: 10 }, SPACING);
    // ref = min corner (13,27); (23,37) -> (20,40)
    expect(13 + d.x).toBe(20);
    expect(27 + d.y).toBe(40);
    // The same delta applies to the other member — relative layout intact.
    expect(113 + d.x).toBe(120);
    expect(67 + d.y).toBe(80);
  });

  it("returns the delta unchanged for an empty snapshot", () => {
    const d = snapGroupDelta(new Map(), { x: 7, y: 3 }, SPACING);
    expect(d).toEqual({ x: 7, y: 3 });
  });
});

describe("snapResizeDelta", () => {
  const bounds: Bounds = { x: 0, y: 0, width: 73, height: 47 };

  it("snaps only the dragged edge for edge handles", () => {
    // East handle moves the right edge (73). +10 -> 83 -> snaps to 80 -> dx=7
    const e = snapResizeDelta(bounds, "e", { x: 10, y: 999 }, SPACING);
    expect(e.x).toBe(7);
    expect(e.y).toBe(999); // y untouched — east doesn't move a horizontal edge

    // South handle moves the bottom edge (47). +5 -> 52 -> snaps to 60 -> dy=13
    const s = snapResizeDelta(bounds, "s", { x: 999, y: 5 }, SPACING);
    expect(s.y).toBe(13);
    expect(s.x).toBe(999);
  });

  it("snaps both edges for a corner handle", () => {
    // SE moves right (73) and bottom (47). +10/+10 -> 83/57 -> 80/60
    const se = snapResizeDelta(bounds, "se", { x: 10, y: 10 }, SPACING);
    expect(bounds.x + bounds.width + se.x).toBe(80);
    expect(bounds.y + bounds.height + se.y).toBe(60);
  });

  it("snaps the moving (west/north) edges for an nw handle", () => {
    const b: Bounds = { x: 13, y: 27, width: 50, height: 40 };
    const nw = snapResizeDelta(b, "nw", { x: 5, y: 5 }, SPACING);
    // left edge 13 +5 -> 18 -> 20 -> dx=7 ; top 27 +5 -> 32 -> 40 -> dy=13
    expect(b.x + nw.x).toBe(20);
    expect(b.y + nw.y).toBe(40);
  });
});

describe("snapCreateBounds", () => {
  it("snaps both corners and keeps non-negative size", () => {
    const b = snapCreateBounds({ x: 13, y: 7, width: 34, height: 26 }, SPACING);
    // tl (13,7) -> (20,0); br (47,33) -> (40,40)
    expect(b).toEqual({ x: 20, y: 0, width: 20, height: 40 });
  });

  it("never produces negative width/height", () => {
    const b = snapCreateBounds({ x: 11, y: 11, width: 2, height: 2 }, SPACING);
    expect(b.width).toBeGreaterThanOrEqual(0);
    expect(b.height).toBeGreaterThanOrEqual(0);
  });
});
