import { describe, expect, it } from "vitest";
import { taperedTrailOutline } from "../src/render/overlay.js";

/**
 * The trail (laser / eraser) is drawn as ONE filled ribbon whose half-width
 * tapers from 0 at the tail to `maxHalf` at the head — a single comet shape, not
 * a stack of alpha-blended segments. These pin the outline geometry.
 */
describe("taperedTrailOutline", () => {
  it("widens from a pointed tail to the full head half-width", () => {
    // A straight horizontal centreline, tail (0,0) → head (20,0). Normal is
    // vertical, so offsets are ±hw in y; hw tapers 0 → maxHalf across 3 points.
    const outline = taperedTrailOutline(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      4,
    );
    // left side (forward) then right side (reversed) → 6 points, closed by fill.
    expect(outline).toHaveLength(6);
    // Tail vertex offset is 0 (both sides collapse onto the centreline point).
    expect(outline[0]).toEqual({ x: 0, y: 0 });
    // Head vertex offset is the full half-width (±4) on each side.
    expect(outline[2]).toEqual({ x: 20, y: 4 });
    expect(outline[3]).toEqual({ x: 20, y: -4 });
    // Mid vertex is half the taper (±2).
    expect(outline[1]).toEqual({ x: 10, y: 2 });
  });

  it("returns a single closed loop (left forward + right backward)", () => {
    const outline = taperedTrailOutline(
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      2,
    );
    // 2 points → 4 outline vertices, one contiguous ring.
    expect(outline).toHaveLength(4);
  });
});
