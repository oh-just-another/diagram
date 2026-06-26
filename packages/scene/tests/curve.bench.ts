import { bench, describe } from "vitest";
import type { Vec2 } from "@oh-just-another/types";
import { catmullRomBeziers, flattenSegments } from "../src/index";

// Waypoint counts span a short connector up to a hand-drawn polyline — the
// inputs the edge hit-test/bounds path flattens on every geometry change.
const waypoints = (count: number): Vec2[] => {
  const pts: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    // A wavy path so segments differ; deterministic, no RNG.
    pts.push({ x: i * 20, y: Math.sin(i / 3) * 50 });
  }
  return pts;
};

const path8 = waypoints(8);
const path64 = waypoints(64);
const segs8 = catmullRomBeziers(path8);
const segs64 = catmullRomBeziers(path64);

describe("catmull-rom segment build", () => {
  bench("8 waypoints", () => {
    catmullRomBeziers(path8);
  });

  bench("64 waypoints", () => {
    catmullRomBeziers(path64);
  });
});

describe("flatten segments (hit-test / bounds sampling)", () => {
  bench("8 segments", () => {
    flattenSegments(path8[0]!, segs8);
  });

  bench("64 segments", () => {
    flattenSegments(path64[0]!, segs64);
  });
});
