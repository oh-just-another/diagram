import { bench, describe } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  SnapEngine,
  addElement,
  anchorSnapper,
  emptyScene,
  gridSnapper,
  orderBetween,
  outlineSnapper,
  type Element,
  type Scene,
} from "../src/index";

// A populated scene with the grid on, so every built-in contributor does real
// work (grid intersection, anchor ports, nearest-outline scan).
const makeScene = (count: number): Scene => {
  let scene = emptyScene();
  scene = { ...scene, viewport: { ...scene.viewport, gridEnabled: true } };
  const cols = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const shape: Element = {
      id: elementId(`s-${i}`),
      layerId: DEFAULT_LAYER_ID,
      type: i % 2 === 0 ? "rectangle" : "ellipse",
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

const scene = makeScene(200);
const engine = new SnapEngine([gridSnapper, anchorSnapper, outlineSnapper]);
const probe = { x: 125, y: 88 };

describe("snap engine — all built-in contributors", () => {
  bench("draw-edge snap over 200 shapes", () => {
    engine.snap({ scene, probe, threshold: 8, gesture: "draw-edge" });
  });

  bench("move-shape snap over 200 shapes", () => {
    engine.snap({ scene, probe, threshold: 8, gesture: "move-shape" });
  });
});
