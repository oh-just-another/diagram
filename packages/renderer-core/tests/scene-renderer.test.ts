import { describe, expect, it, vi } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import {
  addLayer,
  addShape,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Layer,
  type Element,
} from "@oh-just-another/scene";
import { buildSpatialIndex } from "@oh-just-another/scene";
import {
  registerShapeRenderer,
  renderScene,
  ShapeCache,
  type RenderTarget,
  type ShapeRenderer,
} from "../src/index";

/**
 * Minimal mock that records every method call, for verifying ordering,
 * transform stacking and which renderer was invoked for which shape.
 */
const makeRecorder = (): {
  target: RenderTarget;
  calls: { method: string; args: readonly unknown[] }[];
} => {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const handler: ProxyHandler<object> = {
    get: (_target, prop: string) => {
      if (prop === "size") return { width: 1000, height: 1000 };
      if (prop === "then") return undefined;
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        if (prop === "measureText") return { width: 10 };
        return undefined;
      };
    },
  };
  const target = new Proxy({}, handler) as unknown as RenderTarget;
  return { target, calls };
};

const rect = (id: string, layer = DEFAULT_LAYER_ID): Element => ({
  id: elementId(id),
  layerId: layer,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 10,
  height: 10,
});

describe("renderScene", () => {
  it("clears before drawing by default", () => {
    const { target, calls } = makeRecorder();
    renderScene(emptyScene(), target);
    expect(calls[0]?.method).toBe("clear");
  });

  it("skipClear suppresses the clear call", () => {
    const { target, calls } = makeRecorder();
    renderScene(emptyScene(), target, { skipClear: true });
    expect(calls.find((c) => c.method === "clear")).toBeUndefined();
  });

  it("invokes the registered renderer for each shape", () => {
    const renderer = vi.fn<ShapeRenderer>();
    registerShapeRenderer("test-rect", renderer);
    let scene = emptyScene();
    const r = rect("a");
    ({ scene } = addShape(scene, { ...r, type: "test-rect" }));
    ({ scene } = addShape(scene, { ...rect("b"), type: "test-rect" }));
    const { target } = makeRecorder();
    renderScene(scene, target);
    expect(renderer).toHaveBeenCalledTimes(2);
  });

  it("calls onUnknownShape for unregistered types", () => {
    const onUnknown = vi.fn();
    let scene = emptyScene();
    ({ scene } = addShape(scene, { ...rect("a"), type: "no-such-type" }));
    const { target } = makeRecorder();
    renderScene(scene, target, { onUnknownShape: onUnknown });
    expect(onUnknown).toHaveBeenCalledOnce();
  });

  it("skips hidden layers", () => {
    const renderer = vi.fn<ShapeRenderer>();
    registerShapeRenderer("hidden-test", renderer);
    let scene = emptyScene();
    const hidden: Layer = {
      id: layerId("hidden"),
      name: "Hidden",
      visible: false,
      locked: false,
      order: orderBetween(null, null),
    };
    ({ scene } = addLayer(scene, hidden));
    ({ scene } = addShape(scene, { ...rect("a", hidden.id), type: "hidden-test" }));
    const { target } = makeRecorder();
    renderScene(scene, target);
    expect(renderer).not.toHaveBeenCalled();
  });

  it("wraps each shape draw in save/restore", () => {
    const renderer = vi.fn<ShapeRenderer>();
    registerShapeRenderer("ss-test", renderer);
    let scene = emptyScene();
    ({ scene } = addShape(scene, { ...rect("a"), type: "ss-test" }));
    const { target, calls } = makeRecorder();
    renderScene(scene, target);
    // Outer save (for setTransform) + inner save (per shape).
    const saves = calls.filter((c) => c.method === "save").length;
    const restores = calls.filter((c) => c.method === "restore").length;
    expect(saves).toBe(restores);
    expect(saves).toBeGreaterThanOrEqual(2);
  });

  describe("viewport culling", () => {
    // Use built-in `rectangle` so the bounder registry resolves.
    const placeRect = (id: string, x: number, y: number): Element => ({
      ...rect(id),
      position: { x, y },
    });

    it("skips shapes whose AABB does not intersect the viewport", () => {
      const renderer = vi.fn<ShapeRenderer>();
      registerShapeRenderer("rectangle", renderer);
      let scene = emptyScene();
      ({ scene } = addShape(scene, placeRect("inside", 0, 0)));
      ({ scene } = addShape(scene, placeRect("outside", 1000, 1000)));
      const { target } = makeRecorder();
      renderScene(scene, target, {
        viewport: { x: -50, y: -50, width: 200, height: 200 },
      });
      expect(renderer).toHaveBeenCalledOnce();
    });

    it("renders all shapes when viewport is omitted", () => {
      const renderer = vi.fn<ShapeRenderer>();
      registerShapeRenderer("rectangle", renderer);
      let scene = emptyScene();
      ({ scene } = addShape(scene, placeRect("a", 0, 0)));
      ({ scene } = addShape(scene, placeRect("b", 10000, 10000)));
      const { target } = makeRecorder();
      renderScene(scene, target);
      expect(renderer).toHaveBeenCalledTimes(2);
    });

    it("spatialIndex pre-filters candidates", () => {
      const renderer = vi.fn<ShapeRenderer>();
      registerShapeRenderer("rectangle", renderer);
      let scene = emptyScene();
      ({ scene } = addShape(scene, placeRect("inside", 0, 0)));
      ({ scene } = addShape(scene, placeRect("outside", 5000, 5000)));
      const grid = buildSpatialIndex(scene);
      const { target } = makeRecorder();
      renderScene(scene, target, {
        viewport: { x: -50, y: -50, width: 100, height: 100 },
        spatialIndex: grid,
      });
      expect(renderer).toHaveBeenCalledOnce();
    });

    it("reuses bounds cache across calls", () => {
      const renderer = vi.fn<ShapeRenderer>();
      registerShapeRenderer("rectangle", renderer);
      let scene = emptyScene();
      ({ scene } = addShape(scene, placeRect("a", 0, 0)));
      const cache = new ShapeCache<{ x: number; y: number; width: number; height: number }>();
      const { target } = makeRecorder();
      renderScene(scene, target, {
        viewport: { x: -10, y: -10, width: 100, height: 100 },
        boundsCache: cache,
      });
      expect(cache.size).toBe(1);
      renderScene(scene, target, {
        viewport: { x: -10, y: -10, width: 100, height: 100 },
        boundsCache: cache,
      });
      // No second insert — cache hit on identity.
      expect(cache.size).toBe(1);
    });
  });

  describe("LOD", () => {
    const placeRect = (id: string, x: number, y: number): Element => ({
      ...rect(id),
      position: { x, y },
    });

    const sceneWithZoom = (zoom: number, shapes: Element[]) => {
      let scene = emptyScene();
      scene = { ...scene, viewport: { ...scene.viewport, zoom } };
      for (const s of shapes) {
        ({ scene } = addShape(scene, s));
      }
      return scene;
    };

    it("hideText drops text shapes when zoom is below threshold", () => {
      const rectRenderer = vi.fn<ShapeRenderer>();
      const textRenderer = vi.fn<ShapeRenderer>();
      registerShapeRenderer("rectangle", rectRenderer);
      registerShapeRenderer("text", textRenderer);
      const scene = sceneWithZoom(0.2, [
        placeRect("r1", 0, 0),
        {
          id: elementId("t1"),
          layerId: DEFAULT_LAYER_ID,
          type: "text",
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          order: orderBetween(null, null),
          style: {},
          text: "hi",
          fontFamily: "sans",
          fontSize: 12,
        },
      ]);
      const { target } = makeRecorder();
      renderScene(scene, target, { lod: { hideText: 0.5 } });
      expect(rectRenderer).toHaveBeenCalledOnce();
      expect(textRenderer).not.toHaveBeenCalled();
    });

    it("placeholder skips renderers and emits world-bounds rect", () => {
      const rectRenderer = vi.fn<ShapeRenderer>();
      registerShapeRenderer("rectangle", rectRenderer);
      const scene = sceneWithZoom(0.1, [placeRect("a", 0, 0), placeRect("b", 100, 100)]);
      const { target, calls } = makeRecorder();
      renderScene(scene, target, { lod: { placeholder: 0.2 } });
      expect(rectRenderer).not.toHaveBeenCalled();
      const fills = calls.filter((c) => c.method === "fill").length;
      expect(fills).toBe(2);
    });

    it("LOD inactive at high zoom — full render", () => {
      const rectRenderer = vi.fn<ShapeRenderer>();
      registerShapeRenderer("rectangle", rectRenderer);
      const scene = sceneWithZoom(1.5, [placeRect("a", 0, 0)]);
      const { target } = makeRecorder();
      renderScene(scene, target, { lod: { placeholder: 0.2, hideText: 0.5 } });
      expect(rectRenderer).toHaveBeenCalledOnce();
    });
  });

  it("applies TRS transforms for each shape", () => {
    const renderer = vi.fn<ShapeRenderer>();
    registerShapeRenderer("trs-test", renderer);
    let scene = emptyScene();
    const r: Element = {
      ...rect("a"),
      type: "trs-test",
      position: { x: 5, y: 7 },
      rotation: Math.PI / 4,
      scale: { x: 2, y: 3 },
    };
    ({ scene } = addShape(scene, r));
    const { target, calls } = makeRecorder();
    renderScene(scene, target);
    expect(calls.some((c) => c.method === "translate" && c.args[0] === 5 && c.args[1] === 7)).toBe(
      true,
    );
    expect(calls.some((c) => c.method === "rotate" && c.args[0] === Math.PI / 4)).toBe(true);
    expect(calls.some((c) => c.method === "scale" && c.args[0] === 2 && c.args[1] === 3)).toBe(
      true,
    );
  });
});
