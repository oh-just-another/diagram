import { describe, expect, it } from "vitest";
import type { Vec2 } from "@oh-just-another/types";
import { straightElbowFallback } from "../src/index";

const isAxisAligned = (path: readonly Vec2[]): boolean => {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const horizontal = Math.abs(a.y - b.y) < 1e-6;
    const vertical = Math.abs(a.x - b.x) < 1e-6;
    if (!horizontal && !vertical) return false;
  }
  return true;
};

describe("straightElbowFallback", () => {
  const from: Vec2 = { x: 0, y: 0 };
  const to: Vec2 = { x: 200, y: 120 };

  it("free ends (no directions) → single longest-axis-first elbow", () => {
    const path = straightElbowFallback(from, to, null, null);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    // dx (200) >= dy (120) → horizontal first: bend sits at { to.x, from.y }.
    expect(path).toEqual([from, { x: 200, y: 0 }, to]);
    expect(isAxisAligned(path)).toBe(true);
  });

  it("keeps the path axis-aligned with a named-side exit stub", () => {
    const path = straightElbowFallback(from, to, { x: 1, y: 0 }, null);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    expect(isAxisAligned(path)).toBe(true);
    // First hop must follow the exit direction (a horizontal stub).
    expect(path[1]!.y).toBe(from.y);
    expect(path[1]!.x).toBeGreaterThan(from.x);
  });

  it("adds a stub at both ends when both are named-side anchored", () => {
    const path = straightElbowFallback(from, to, { x: 1, y: 0 }, { x: -1, y: 0 });
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    expect(isAxisAligned(path)).toBe(true);
    // The point before `to` is the toDir stub, offset horizontally from `to`.
    const beforeTo = path[path.length - 2]!;
    expect(beforeTo.y).toBe(to.y);
    expect(beforeTo.x).toBeLessThan(to.x);
  });

  it("is pure / deterministic — same inputs give an equal path", () => {
    const a = straightElbowFallback(from, to, { x: 0, y: -1 }, { x: 0, y: 1 });
    const b = straightElbowFallback(from, to, { x: 0, y: -1 }, { x: 0, y: 1 });
    expect(a).toEqual(b);
  });
});
