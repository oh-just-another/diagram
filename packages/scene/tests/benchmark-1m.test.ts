import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  buildSpatialIndex,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  queryByIndex,
  type Element,
} from "../src/index";

/**
 * 1M-shape scene benchmark. Verifies the engine survives a 1M-shape
 * construction and can answer a spatial-index range query within one
 * frame budget (< 16 ms).
 *
 * Disabled by default — opt-in via `BENCH_1M=1 pnpm test`. Setup alone
 * allocates ~120 MB and takes ~5 s on M-series.
 */

const SHOULD_RUN = process.env.BENCH_1M === "1";

const SHAPE_COUNT = 1_000_000;
const WORLD = 1_000_000;

const buildHugeScene = () => {
  let scene = emptyScene();
  for (let i = 0; i < SHAPE_COUNT; i++) {
    const s: Element = {
      id: elementId(`s${i}`),
      layerId: DEFAULT_LAYER_ID,
      type: "rectangle",
      position: {
        x: ((i * 9301 + 49297) % 233280) * (WORLD / 233280),
        y: ((i * 19283 + 51317) % 233280) * (WORLD / 233280),
      },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      width: 40,
      height: 40,
    };
    ({ scene } = addElement(scene, s));
  }
  return scene;
};

describe.skipIf(!SHOULD_RUN)("benchmark (1M shapes, opt-in)", () => {
  it("constructs without throwing within 30 s budget", () => {
    const t0 = performance.now();
    const scene = buildHugeScene();
    const elapsed = performance.now() - t0;
    expect(scene.elements.size).toBe(SHAPE_COUNT);
    // Generous ceiling — the concern is whether it completes at all.
    expect(elapsed).toBeLessThan(30_000);
  });

  it("spatial-index range query stays under 16 ms (single-frame budget)", () => {
    const scene = buildHugeScene();
    const grid = buildSpatialIndex(scene, 1024);
    const range = { x: 500_000, y: 500_000, width: 50_000, height: 50_000 };
    // Warm.
    for (let i = 0; i < 3; i++) queryByIndex(scene, grid, range);
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      queryByIndex(scene, grid, range);
      samples.push(performance.now() - t0);
    }
    const sorted = samples.sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    expect(median).toBeLessThan(16);
  });
});
