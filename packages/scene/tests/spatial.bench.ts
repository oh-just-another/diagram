import { bench, describe } from "vitest";
import { elementId } from "@oh-just-another/types";
import type { Bounds } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  buildSpatialIndex,
  emptyScene,
  getElementsInBounds,
  orderBetween,
  queryByIndex,
  type Element,
  type Scene,
} from "../src/index";

// Lay shapes out on a regular grid so query windows hit a predictable subset.
// Sizes mirror the C4 target ("range-query < 1ms on 1k elements") plus a 10k
// stress point to expose super-linear regressions in the grid.
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

const scene1k = makeScene(1000);
const scene10k = makeScene(10000);
const index1k = buildSpatialIndex(scene1k);
const index10k = buildSpatialIndex(scene10k);

// A window covering a handful of cells near the origin — the realistic
// "what's under the cursor / in the marquee" query size.
const window: Bounds = { x: 0, y: 0, width: 200, height: 200 };

describe("spatial index build", () => {
  bench("buildSpatialIndex 1k", () => {
    buildSpatialIndex(scene1k);
  });

  bench("buildSpatialIndex 10k", () => {
    buildSpatialIndex(scene10k);
  });
});

describe("range query — indexed vs linear scan", () => {
  bench("queryByIndex 1k", () => {
    queryByIndex(scene1k, index1k, window);
  });

  bench("queryByIndex 10k", () => {
    queryByIndex(scene10k, index10k, window);
  });

  bench("getElementsInBounds (linear) 1k", () => {
    getElementsInBounds(scene1k, window);
  });

  bench("getElementsInBounds (linear) 10k", () => {
    getElementsInBounds(scene10k, window);
  });
});
