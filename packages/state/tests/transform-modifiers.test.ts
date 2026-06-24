import { describe, expect, it } from "vitest";
import { constrainDeltaToAxis } from "../src/editor/applies/move";
import { lockAspectRatio } from "../src/editor/resize-helpers";

describe("constrainDeltaToAxis (Shift axis-lock for moves)", () => {
  it("keeps the dominant axis and zeroes the other", () => {
    expect(constrainDeltaToAxis({ x: 30, y: 10 })).toEqual({ x: 30, y: 0 });
    expect(constrainDeltaToAxis({ x: -8, y: 25 })).toEqual({ x: 0, y: 25 });
  });

  it("prefers horizontal on a tie", () => {
    expect(constrainDeltaToAxis({ x: 12, y: -12 })).toEqual({ x: 12, y: 0 });
  });

  it("passes a zero delta through", () => {
    expect(constrainDeltaToAxis({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("lockAspectRatio (Shift aspect-lock for resizes)", () => {
  const original = { x: 0, y: 0, width: 100, height: 50 };

  it("a corner drag scales uniformly by the dominant axis", () => {
    // sx=1.2, sy=1.6 → the larger relative change (height) drives both.
    const out = lockAspectRatio(original, { x: 0, y: 0, width: 120, height: 80 });
    expect(out.width).toBeCloseTo(160);
    expect(out.height).toBeCloseTo(80);
  });

  it("an edge drag scales the perpendicular axis to keep the ratio", () => {
    const grow = lockAspectRatio(original, { x: 0, y: 0, width: 150, height: 50 });
    expect(grow.width).toBeCloseTo(150);
    expect(grow.height).toBeCloseTo(75);

    const shrink = lockAspectRatio(original, { x: 0, y: 0, width: 50, height: 50 });
    expect(shrink.width).toBeCloseTo(50);
    expect(shrink.height).toBeCloseTo(25);
  });

  it("preserves the original 2:1 ratio", () => {
    const out = lockAspectRatio(original, { x: 0, y: 0, width: 200, height: 60 });
    expect(out.width / out.height).toBeCloseTo(2);
  });

  it("returns a degenerate original unchanged", () => {
    const degenerate = { x: 0, y: 0, width: 0, height: 50 };
    const raw = { x: 0, y: 0, width: 10, height: 80 };
    expect(lockAspectRatio(degenerate, raw)).toEqual(raw);
  });
});
