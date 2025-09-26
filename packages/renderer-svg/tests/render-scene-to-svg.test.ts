import { describe, expect, it } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addShape,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { renderSceneToSvg } from "../src/render-scene-to-svg";

const sceneOf = (width: number, height: number): Scene => {
  const s = emptyScene();
  return { ...s, viewport: { ...s.viewport, size: { width, height } } };
};

const rect = (id: string, x = 0, y = 0, w = 50, h = 30, fill = "#abc"): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill },
  width: w,
  height: h,
});

describe("renderSceneToSvg", () => {
  it("renders an empty scene as an empty SVG document", () => {
    const svg = renderSceneToSvg(sceneOf(200, 100));
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('viewBox="0 0 200 100"');
    // Empty scene → no path elements (the scene-clear is a no-op for SvgTarget).
    expect(svg).not.toContain("<path");
  });

  it("renders a single rectangle in its world position", () => {
    let scene = sceneOf(200, 100);
    ({ scene } = addShape(scene, rect("a", 30, 40)));
    const svg = renderSceneToSvg(scene);
    expect(svg).toContain('fill="#abc"');
    // Rect translated by shape.position = (30, 40), drawn from (0,0,50,30).
    expect(svg).toMatch(/d="M30 40 L80 40 L80 70 L30 70 Z"/);
  });

  it("renders multiple shapes in z-order", () => {
    let scene = sceneOf(200, 100);
    ({ scene } = addShape(scene, rect("bg", 0, 0, 200, 100, "#000")));
    ({ scene } = addShape(scene, rect("fg", 20, 20, 50, 50, "#fff")));
    const svg = renderSceneToSvg(scene);
    // Both rects present; bg painted first (lower z), fg painted after.
    const bgIndex = svg.indexOf('fill="#000"');
    const fgIndex = svg.indexOf('fill="#fff"');
    expect(bgIndex).toBeGreaterThan(-1);
    expect(fgIndex).toBeGreaterThan(-1);
    expect(bgIndex).toBeLessThan(fgIndex);
  });

  it("respects width/height options when provided", () => {
    const svg = renderSceneToSvg(sceneOf(200, 100), {
      width: 400,
      height: 200,
    });
    expect(svg).toContain('viewBox="0 0 400 200"');
  });

  it("skips hidden layers", () => {
    let scene = sceneOf(200, 100);
    const hidden = layerId("hidden");
    scene = {
      ...scene,
      layers: new Map([
        [DEFAULT_LAYER_ID, scene.layers.get(DEFAULT_LAYER_ID)!],
        [
          hidden,
          { id: hidden, name: "h", visible: false, locked: false, order: orderBetween(null, null) },
        ],
      ]),
    };
    ({ scene } = addShape(scene, { ...rect("a", 0, 0), layerId: hidden, style: { fill: "#f00" } }));
    const svg = renderSceneToSvg(scene);
    expect(svg).not.toContain('fill="#f00"');
  });
});
