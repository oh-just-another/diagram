import { describe, expect, it } from "vitest";
import type { Bounds, Vec2 } from "@oh-just-another/types";
import { elbowRoute } from "../src/elbow-router";

const segmentsAreAxisAligned = (path: readonly Vec2[]): boolean => {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (a.x !== b.x && a.y !== b.y) return false;
  }
  return true;
};

const segmentCrossesBox = (a: Vec2, b: Vec2, box: Bounds, margin = 0): boolean => {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const oMaxX = box.x + box.width;
  const oMaxY = box.y + box.height;
  if (maxX <= box.x + margin || minX >= oMaxX - margin) return false;
  if (maxY <= box.y + margin || minY >= oMaxY - margin) return false;
  return true;
};

describe("elbowRoute", () => {
  it("returns a single-point trivial path when from === to", () => {
    const out = elbowRoute({ x: 0, y: 0 }, { x: 0, y: 0 }, []);
    expect(out).toEqual([{ x: 0, y: 0 }]);
  });

  it("draws a straight axis-aligned line when no obstacles in the way", () => {
    const out = elbowRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, []);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it("produces only axis-aligned segments", () => {
    const out = elbowRoute({ x: 0, y: 0 }, { x: 100, y: 50 }, [
      { x: 30, y: 20, width: 40, height: 20 },
    ]);
    expect(out).not.toBeNull();
    expect(segmentsAreAxisAligned(out!)).toBe(true);
  });

  it("detours around an obstacle on the direct path", () => {
    const obstacle: Bounds = { x: 40, y: -10, width: 20, height: 20 };
    const out = elbowRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, [obstacle]);
    expect(out).not.toBeNull();
    // No segment should pass through the obstacle's interior (with
    // the margin allowance).
    for (let i = 1; i < out!.length; i++) {
      expect(segmentCrossesBox(out![i - 1]!, out![i]!, obstacle)).toBe(false);
    }
    // Path starts at `from` and ends at `to`.
    expect(out![0]).toEqual({ x: 0, y: 0 });
    expect(out![out!.length - 1]).toEqual({ x: 100, y: 0 });
  });

  it("collapses colinear intermediate waypoints", () => {
    // Free path — should not return a fully-walked grid.
    const out = elbowRoute({ x: 0, y: 0 }, { x: 200, y: 0 }, [])!;
    expect(out.length).toBe(2);
  });

  it("honours a custom margin override", () => {
    const obstacle: Bounds = { x: 40, y: -10, width: 20, height: 20 };
    const out = elbowRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, [obstacle], { margin: 5 });
    expect(out).not.toBeNull();
  });
});
