import { bench, describe } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addShape,
  emptyScene,
  orderBetween,
  type Scene,
  type Shape,
} from "@oh-just-another/scene";
import { renderToSvg } from "../src/index";

const sceneOf = (width: number, height: number): Scene => {
  const s = emptyScene();
  return { ...s, viewport: { ...s.viewport, size: { width, height } } };
};

const makeScene = (count: number): Scene => {
  let scene = sceneOf(2000, 1500);
  const cols = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const shape: Shape = {
      id: elementId(`s-${i}`),
      layerId: DEFAULT_LAYER_ID,
      type: i % 2 === 0 ? "rectangle" : "ellipse",
      position: { x: (i % cols) * 60, y: Math.floor(i / cols) * 50 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {
        fill: i % 3 === 0 ? "#1a73e8" : i % 3 === 1 ? "#fff2a8" : "#e6ffe6",
        stroke: "#333",
        strokeWidth: 1,
      },
      width: 40,
      height: 30,
    };
    ({ scene } = addShape(scene, shape));
  }
  return scene;
};

const scenes = {
  10: makeScene(10),
  100: makeScene(100),
  1000: makeScene(1000),
  5000: makeScene(5000),
};

describe("renderToSvg throughput", () => {
  bench("10 shapes", () => {
    renderToSvg(scenes[10]);
  });

  bench("100 shapes", () => {
    renderToSvg(scenes[100]);
  });

  bench("1000 shapes", () => {
    renderToSvg(scenes[1000]);
  });

  bench("5000 shapes", () => {
    renderToSvg(scenes[5000]);
  });
});
