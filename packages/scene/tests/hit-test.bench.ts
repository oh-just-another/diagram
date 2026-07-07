import { bench, describe } from "vitest";
import { elementId, type Vec2 } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  buildSpatialIndex,
  emptyScene,
  getElementAt,
  getElementAtIndexed,
  orderBetween,
  type Element,
  type Scene,
} from "../src/index";

// Point hit-test over a dense scene — the per-pointer-move cost in the
// editor. Grid layout mirrors spatial.bench.ts; 10k is the stress point
// where a linear top-to-bottom scan visibly lags the indexed path.
const makeScene = (count: number): Scene => {
  let scene = emptyScene();
  const cols = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const shape: Element = {
      id: elementId(`s-${i}`),
      layerId: DEFAULT_LAYER_ID,
      type: "rectangle",
      position: { x: (i % cols) * 60, y: Math.floor(i / cols) * 50 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      width: 40,
      height: 30,
    };
    ({ scene } = addElement(scene, shape));
  }
  return scene;
};

const scene10k = makeScene(10000);
const index10k = buildSpatialIndex(scene10k);

// Hit near the origin: worst case for the linear scan (shapes iterate
// top-to-bottom, s-0 is the very last candidate checked).
const hitFirst: Vec2 = { x: 20, y: 15 };
// Hit near the end of the z-order: best case for the linear scan.
const cols = Math.ceil(Math.sqrt(10000));
const hitLast: Vec2 = { x: (cols - 1) * 60 + 20, y: (cols - 1) * 50 + 15 };
// Gap between grid cells: full scan, no hit.
const miss: Vec2 = { x: 45, y: 35 };

describe("getElementAt — linear scan, 10k", () => {
  bench("hit bottom of z-order", () => {
    getElementAt(scene10k, hitFirst);
  });
  bench("hit top of z-order", () => {
    getElementAt(scene10k, hitLast);
  });
  bench("miss", () => {
    getElementAt(scene10k, miss);
  });
});

describe("getElementAtIndexed — spatial grid, 10k", () => {
  bench("hit bottom of z-order", () => {
    getElementAtIndexed(scene10k, index10k, hitFirst);
  });
  bench("hit top of z-order", () => {
    getElementAtIndexed(scene10k, index10k, hitLast);
  });
  bench("miss", () => {
    getElementAtIndexed(scene10k, index10k, miss);
  });
});
