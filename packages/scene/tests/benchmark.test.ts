import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  buildSpatialIndex,
  DEFAULT_LAYER_ID,
  emptyScene,
  getElementsInBounds,
  orderBetween,
  queryByIndex,
  type Element,
} from "../src/index";

const SHAPE_COUNT = 1000;
const WORLD = 10_000;
const SHAPE_SIZE = 40;

const buildScene = () => {
  let scene = emptyScene();
  for (let i = 0; i < SHAPE_COUNT; i++) {
    const s: Element = {
      id: elementId(`s${i}`),
      layerId: DEFAULT_LAYER_ID,
      type: "rectangle",
      position: {
        // Pseudo-random uniform spread; deterministic for stable timings.
        x: ((i * 9301 + 49297) % 233280) * (WORLD / 233280),
        y: ((i * 19283 + 51317) % 233280) * (WORLD / 233280),
      },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      width: SHAPE_SIZE,
      height: SHAPE_SIZE,
    };
    ({ scene } = addElement(scene, s));
  }
  return scene;
};

const median = (samples: readonly number[]): number => {
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = sorted.length >>> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
};

describe("benchmark (1000 shapes)", () => {
  it("scene construction is reasonable", () => {
    const t0 = performance.now();
    const scene = buildScene();
    const elapsed = performance.now() - t0;
    expect(scene.elements.size).toBe(SHAPE_COUNT);
    // No hard SLA; just guard against catastrophic regressions.
    expect(elapsed).toBeLessThan(1000);
  });

  it("spatial-index range query < 1 ms (median of 50 runs)", () => {
    const scene = buildScene();
    const grid = buildSpatialIndex(scene, 256);
    const range = { x: 4000, y: 4000, width: 1000, height: 1000 };

    // Warm-up to let V8 settle.
    for (let i = 0; i < 10; i++) queryByIndex(scene, grid, range);

    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      queryByIndex(scene, grid, range);
      samples.push(performance.now() - t0);
    }

    const med = median(samples);
    expect(med).toBeLessThan(1);
  });

  it("linear scan is materially slower than index (sanity)", () => {
    const scene = buildScene();
    const grid = buildSpatialIndex(scene, 256);
    const range = { x: 4000, y: 4000, width: 1000, height: 1000 };

    const linearSamples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      getElementsInBounds(scene, range);
      linearSamples.push(performance.now() - t0);
    }
    const linMed = median(linearSamples);

    const indexSamples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      queryByIndex(scene, grid, range);
      indexSamples.push(performance.now() - t0);
    }
    const idxMed = median(indexSamples);

    // Index should win by a comfortable margin on 1k shapes.
    expect(idxMed).toBeLessThan(linMed);
  });
});
