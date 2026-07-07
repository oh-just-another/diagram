import { bench, describe } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
  type PathCommand,
  type Scene,
  type Style,
} from "@oh-just-another/scene";
import { installBuiltinRenderers, renderScene } from "@oh-just-another/renderer-core";
import { RecordingTarget } from "../src/index";

installBuiltinRenderers();

const SURFACE = { width: 1920, height: 1080 };

const sceneOf = (): Scene => {
  const s = emptyScene();
  return { ...s, viewport: { ...s.viewport, size: { ...SURFACE } } };
};

/** Grid of identically-styled rectangles; `style` controls sharp vs rounded. */
const makeRectScene = (count: number, style: Style): Scene => {
  let scene = sceneOf();
  const cols = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const shape: Element = {
      id: elementId(`r-${i}`),
      layerId: DEFAULT_LAYER_ID,
      type: "rectangle",
      position: { x: (i % cols) * 60, y: Math.floor(i / cols) * 50 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style,
      width: 40,
      height: 30,
    };
    ({ scene } = addElement(scene, shape));
  }
  return scene;
};

/** Wavy closed blob of alternating quadratic/cubic segments. */
const blobCommands = (segments: number): readonly PathCommand[] => {
  const cmds: PathCommand[] = [{ kind: "M", to: { x: 20, y: 0 } }];
  for (let i = 1; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const r = 20 + 6 * Math.sin(i * 2.7);
    const to = { x: Math.cos(a) * r + 20, y: Math.sin(a) * r + 20 };
    if (i % 2 === 0) {
      cmds.push({ kind: "Q", control: { x: to.x + 5, y: to.y - 5 }, to });
    } else {
      cmds.push({
        kind: "C",
        control1: { x: to.x - 8, y: to.y + 4 },
        control2: { x: to.x + 4, y: to.y - 8 },
        to,
      });
    }
  }
  cmds.push({ kind: "Z" });
  return cmds;
};

/** Grid of path elements, each a multi-segment curve blob. */
const makePathScene = (count: number, segmentsPerPath: number): Scene => {
  let scene = sceneOf();
  const cols = Math.ceil(Math.sqrt(count));
  const commands = blobCommands(segmentsPerPath);
  for (let i = 0; i < count; i++) {
    const shape: Element = {
      id: elementId(`p-${i}`),
      layerId: DEFAULT_LAYER_ID,
      type: "path",
      position: { x: (i % cols) * 70, y: Math.floor(i / cols) * 70 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: { fill: "#e6f0ff", stroke: "#1a73e8", strokeWidth: 2 },
      commands,
    };
    ({ scene } = addElement(scene, shape));
  }
  return scene;
};

const sharpStyle: Style = { fill: "#1a73e8", stroke: "#333", strokeWidth: 1 };
const roundedStyle: Style = { ...sharpStyle, roundness: { type: "round", value: 8 } };

const rects1k = makeRectScene(1000, sharpStyle);
const rects5k = makeRectScene(5000, sharpStyle);
const rounded1k = makeRectScene(1000, roundedStyle);
const rounded5k = makeRectScene(5000, roundedStyle);
// 300 paths × 12 curve segments — a "hand-drawn diagram" scene shape.
const paths300 = makePathScene(300, 12);
const paths600 = makePathScene(600, 12);

const target = new RecordingTarget(SURFACE.width, SURFACE.height);

/** Render then flush so the command buffer doesn't grow across iterations. */
const run = (scene: Scene): void => {
  renderScene(scene, target);
  target.flush();
};

describe("rect-grid — RecordingTarget", () => {
  bench("1k rects", () => {
    run(rects1k);
  });
  bench("5k rects", () => {
    run(rects5k);
  });
});

describe("rounded-grid — RecordingTarget (curve path per corner)", () => {
  bench("1k rounded rects", () => {
    run(rounded1k);
  });
  bench("5k rounded rects", () => {
    run(rounded5k);
  });
});

describe("path-heavy — RecordingTarget (Q/C curve segments)", () => {
  bench("300 paths x 12 curves", () => {
    run(paths300);
  });
  bench("600 paths x 12 curves", () => {
    run(paths600);
  });
});
