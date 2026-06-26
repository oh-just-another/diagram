import { describe, expect, it } from "vitest";
import { constrainDeltaToAxis } from "../src/editor/applies/move";
import {
  applyResizeConstraints,
  lockAspectRatio,
  resizeFromCenter,
  resizeFromHandle,
} from "../src/editor/resize-helpers";

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

describe("resizeFromCenter (Alt centre-anchored resize)", () => {
  const original = { x: 0, y: 0, width: 100, height: 50 }; // centre (50, 25)

  it("doubles a corner drag's size change and keeps the centre fixed", () => {
    // Drag `se` by (20, 10): free box = 120×60.
    const free = resizeFromHandle(original, "se", { x: 20, y: 10 });
    const out = resizeFromCenter(original, free);
    expect(out.width).toBeCloseTo(140); // 100 + 2·20
    expect(out.height).toBeCloseTo(70); // 50 + 2·10
    expect(out.x + out.width / 2).toBeCloseTo(50); // centre x preserved
    expect(out.y + out.height / 2).toBeCloseTo(25); // centre y preserved
  });

  it("expands only the dragged axis for an edge handle", () => {
    const free = resizeFromHandle(original, "e", { x: 20, y: 0 });
    const out = resizeFromCenter(original, free);
    expect(out.width).toBeCloseTo(140);
    expect(out.height).toBeCloseTo(50);
    expect(out.x).toBeCloseTo(-20); // grew left too
  });
});

describe("applyResizeConstraints with fromCenter", () => {
  const original = { x: 0, y: 0, width: 100, height: 50 };

  it("anchors the clamped box on the original centre", () => {
    const raw = { x: -20, y: -10, width: 140, height: 70 };
    const out = applyResizeConstraints(original, raw, "se", {}, true);
    expect(out.x + out.width / 2).toBeCloseTo(50);
    expect(out.y + out.height / 2).toBeCloseTo(25);
  });

  it("clamps to min size while staying centred", () => {
    const raw = { x: 40, y: 20, width: 2, height: 2 };
    const out = applyResizeConstraints(original, raw, "se", { minWidth: 20, minHeight: 20 }, true);
    expect(out.width).toBeCloseTo(20);
    expect(out.height).toBeCloseTo(20);
    expect(out.x + out.width / 2).toBeCloseTo(50);
    expect(out.y + out.height / 2).toBeCloseTo(25);
  });
});
