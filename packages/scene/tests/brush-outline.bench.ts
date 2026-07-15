import { bench, describe } from "vitest";
import type { BrushPoint } from "../src/index";
import { brushOutline } from "../src/index";

// Point counts span a short dab up to the capture cap (MAX_BRUSH_POINTS in
// state is 2048) — the outline is rebuilt from scratch on every render of a
// stroke, so its cost on a long stroke is the render-path budget that matters.
const strokePoints = (count: number): BrushPoint[] => {
  const pts: BrushPoint[] = [];
  for (let i = 0; i < count; i++) {
    // A wavy variable-width path so joins alternate convex/concave sides;
    // deterministic, no RNG.
    pts.push({ x: i * 3, y: Math.sin(i / 5) * 40, width: 2 + Math.sin(i / 7) * 1.5 });
  }
  return pts;
};

const stroke64 = strokePoints(64);
const stroke512 = strokePoints(512);
const stroke2048 = strokePoints(2048);

describe("brush outline build (render path)", () => {
  bench("64 points", () => {
    brushOutline(stroke64);
  });

  bench("512 points", () => {
    brushOutline(stroke512);
  });

  bench("2048 points (capture cap)", () => {
    brushOutline(stroke2048);
  });
});
