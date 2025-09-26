import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addShape,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { stringifyScene } from "@oh-just-another/serialization";
import { renderToSvg } from "../src/index";

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

describe("renderToSvg", () => {
  it("renders an in-memory scene", () => {
    let scene = sceneOf(200, 100);
    ({ scene } = addShape(scene, rect("a", 10, 10)));
    const svg = renderToSvg(scene);
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 200 100"');
    expect(svg).toContain('fill="#abc"');
  });

  it("accepts a serialized scene as JSON string", () => {
    let scene = sceneOf(150, 75);
    ({ scene } = addShape(scene, rect("a")));
    const json = stringifyScene(scene);
    const svg = renderToSvg(json);
    expect(svg).toContain('viewBox="0 0 150 75"');
  });

  it("forwards width/height overrides", () => {
    const svg = renderToSvg(sceneOf(200, 100), { width: 400, height: 200 });
    expect(svg).toContain('viewBox="0 0 400 200"');
  });

  it("rejects malformed JSON", () => {
    expect(() => renderToSvg("{not json}")).toThrow();
  });
});
