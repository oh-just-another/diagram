import { describe, expect, it } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
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

const image = (id: string, alt?: string): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "image",
    position: { x: 5, y: 5 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    src: "data:,",
    width: 40,
    height: 30,
    ...(alt === undefined ? {} : { alt }),
  }) as Element;

describe("renderSceneToSvg", () => {
  it("emits an image element's alt as the <title> of its <image>", () => {
    let scene = sceneOf(200, 100);
    ({ scene } = addElement(scene, image("img", "Sales by region")));
    const svg = renderSceneToSvg(scene);
    expect(svg).toContain('href="data:,"><title>Sales by region</title></image>');
    let plain = sceneOf(200, 100);
    ({ scene: plain } = addElement(plain, image("img2")));
    expect(renderSceneToSvg(plain)).not.toContain("<title>");
  });

  it("renders an empty scene as an empty SVG document", () => {
    const svg = renderSceneToSvg(sceneOf(200, 100));
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('viewBox="0 0 200 100"');
    // Empty scene → no path elements (the scene-clear is a no-op for SvgTarget).
    expect(svg).not.toContain("<path");
  });

  it("renders a single rectangle in its world position", () => {
    let scene = sceneOf(200, 100);
    ({ scene } = addElement(scene, rect("a", 30, 40)));
    const svg = renderSceneToSvg(scene);
    expect(svg).toContain('fill="#abc"');
    // Rect translated by shape.position = (30, 40), drawn from (0,0,50,30).
    expect(svg).toMatch(/d="M30 40 L80 40 L80 70 L30 70 Z"/);
  });

  it("renders multiple shapes in z-order", () => {
    let scene = sceneOf(200, 100);
    ({ scene } = addElement(scene, rect("bg", 0, 0, 200, 100, "#000")));
    ({ scene } = addElement(scene, rect("fg", 20, 20, 50, 50, "#fff")));
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

  const textEl = (over: Partial<Element>): Element =>
    ({
      id: elementId("txt"),
      layerId: DEFAULT_LAYER_ID,
      type: "text",
      position: { x: 10, y: 20 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: { fill: "#000" },
      text: "Hello world",
      fontFamily: "sans-serif",
      fontSize: 16,
      ...over,
    }) as Element;

  it("renders a plain text element as one <text> element", () => {
    let scene = sceneOf(200, 100);
    ({ scene } = addElement(scene, textEl({})));
    const svg = renderSceneToSvg(scene);
    const count = (svg.match(/<text /g) ?? []).length;
    expect(count).toBe(1);
    expect(svg).toContain(">Hello world</text>");
  });

  it("renders styled text runs as per-run <text> segments", () => {
    let scene = sceneOf(200, 100);
    ({ scene } = addElement(
      scene,
      textEl({
        runs: [
          { text: "Hello", style: { fontWeight: "bold", fill: "#f00" } },
          { text: " world", style: { fontStyle: "italic" } },
        ],
      }),
    ));
    const svg = renderSceneToSvg(scene);
    const texts = svg.match(/<text [^>]*>[^<]*<\/text>/g) ?? [];
    expect(texts.length).toBe(2);
    // Bold red "Hello" segment.
    const hello = texts.find((t) => t.includes(">Hello</text>"));
    expect(hello).toBeDefined();
    expect(hello).toContain('font-weight="bold"');
    expect(hello).toContain('fill="#f00"');
    // Italic default-colour " world" segment.
    const world = texts.find((t) => t.includes("world"));
    expect(world).toBeDefined();
    expect(world).toContain('font-style="italic"');
    expect(world).toContain('fill="#000"');
    expect(world).not.toContain('font-weight="bold"');
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
    ({ scene } = addElement(scene, {
      ...rect("a", 0, 0),
      layerId: hidden,
      style: { fill: "#f00" },
    }));
    const svg = renderSceneToSvg(scene);
    expect(svg).not.toContain('fill="#f00"');
  });
});
