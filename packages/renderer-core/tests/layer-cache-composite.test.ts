import { describe, expect, it, vi } from "vitest";
import { layerId as castLayerId, elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import {
  InMemoryLayerCompositeCache,
  installBuiltinRenderers,
  renderScene,
} from "../src/index";

installBuiltinRenderers();

const rect = (id: string, x = 0): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 50,
  height: 50,
});

const sceneWith = (...shapes: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of shapes) s = addElement(s, sh).scene;
  return {
    ...s,
    viewport: { ...s.viewport, size: { width: 400, height: 400 } },
  };
};

const stubTarget = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  setFill: vi.fn(),
  setStroke: vi.fn(),
  setStrokeWidth: vi.fn(),
  setOpacity: vi.fn(),
  setLineCap: vi.fn(),
  setLineJoin: vi.fn(),
  setDashArray: vi.fn(),
  setFont: vi.fn(),
  setTextAlign: vi.fn(),
  setTextBaseline: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  setTransform: vi.fn(),
  resetTransform: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  rect: vi.fn(),
  ellipse: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  drawImage: vi.fn(),
  clear: vi.fn(),
  size: { width: 400, height: 400 },
});

describe("renderScene + LayerCompositeCache", () => {
  it("calls compositeLayerBitmap on first frame and caches", () => {
    const scene = sceneWith(rect("a"), rect("b", 100));
    const target = stubTarget();
    const cache = new InMemoryLayerCompositeCache<string>();
    const compositeLayerBitmap = vi.fn(() => "layer-bitmap");

    renderScene(scene, target as never, {
      layerCompositeCache: cache,
      compositeLayerBitmap,
    });

    expect(compositeLayerBitmap).toHaveBeenCalledOnce();
    expect(target.drawImage).toHaveBeenCalledOnce(); // one layer = one draw
    // Per-shape renderer NOT invoked — fast path took over.
    expect(target.rect).not.toHaveBeenCalled();
  });

  it("uses cached bitmap on subsequent frames without re-compositing", () => {
    const scene = sceneWith(rect("a"));
    const target = stubTarget();
    const cache = new InMemoryLayerCompositeCache<string>();
    const compositeLayerBitmap = vi.fn(() => "L");

    renderScene(scene, target as never, { layerCompositeCache: cache, compositeLayerBitmap });
    renderScene(scene, target as never, { layerCompositeCache: cache, compositeLayerBitmap });

    expect(compositeLayerBitmap).toHaveBeenCalledOnce();
  });

  it("dirtyLayerIds drops cached bitmap → re-composites", () => {
    const scene = sceneWith(rect("a"));
    const target = stubTarget();
    const cache = new InMemoryLayerCompositeCache<string>();
    const compositeLayerBitmap = vi.fn(() => "L");

    renderScene(scene, target as never, { layerCompositeCache: cache, compositeLayerBitmap });
    renderScene(scene, target as never, {
      layerCompositeCache: cache,
      compositeLayerBitmap,
      dirtyLayerIds: new Set([castLayerId(DEFAULT_LAYER_ID)]),
    });

    expect(compositeLayerBitmap).toHaveBeenCalledTimes(2);
  });

  it("falls back to per-shape render when compositeLayerBitmap returns null", () => {
    const scene = sceneWith(rect("a"));
    const target = stubTarget();
    const cache = new InMemoryLayerCompositeCache<string>();

    renderScene(scene, target as never, {
      layerCompositeCache: cache,
      compositeLayerBitmap: () => null,
    });

    expect(target.drawImage).not.toHaveBeenCalled();
    expect(target.rect).toHaveBeenCalled();
  });

  it("no cache + no rasteriser → original per-shape path", () => {
    const scene = sceneWith(rect("a"));
    const target = stubTarget();

    renderScene(scene, target as never);

    expect(target.drawImage).not.toHaveBeenCalled();
    expect(target.rect).toHaveBeenCalled();
  });
});
