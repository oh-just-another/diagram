import { describe, expect, it, vi } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import {
  addLayer,
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Layer,
  type Element,
} from "@oh-just-another/scene";
import { buildSpatialIndex } from "@oh-just-another/scene";
import {
  registerElementRenderer,
  renderScene,
  ElementCache,
  type RenderTarget,
  type ElementRenderer,
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
    const renderer = vi.fn<ElementRenderer>();
    registerElementRenderer("test-rect", renderer);
    let scene = emptyScene();
    const r = rect("a");
    ({ scene } = addElement(scene, { ...r, type: "test-rect" }));
    ({ scene } = addElement(scene, { ...rect("b"), type: "test-rect" }));
    const { target } = makeRecorder();
    renderScene(scene, target);
    expect(renderer).toHaveBeenCalledTimes(2);
  });

  it("calls onUnknownElement for unregistered types", () => {
    const onUnknown = vi.fn();
    let scene = emptyScene();
    ({ scene } = addElement(scene, { ...rect("a"), type: "no-such-type" }));
    const { target } = makeRecorder();
    renderScene(scene, target, { onUnknownElement: onUnknown });
    expect(onUnknown).toHaveBeenCalledOnce();
  });

  it("skips hidden layers", () => {
    const renderer = vi.fn<ElementRenderer>();
    registerElementRenderer("hidden-test", renderer);
    let scene = emptyScene();
    const hidden: Layer = {
      id: layerId("hidden"),
      name: "Hidden",
      visible: false,
      locked: false,
      order: orderBetween(null, null),
    };
    ({ scene } = addLayer(scene, hidden));
    ({ scene } = addElement(scene, { ...rect("a", hidden.id), type: "hidden-test" }));
    const { target } = makeRecorder();
    renderScene(scene, target);
    expect(renderer).not.toHaveBeenCalled();
  });

  it("wraps each shape draw in save/restore", () => {
    const renderer = vi.fn<ElementRenderer>();
    registerElementRenderer("ss-test", renderer);
    let scene = emptyScene();
    ({ scene } = addElement(scene, { ...rect("a"), type: "ss-test" }));
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
      const renderer = vi.fn<ElementRenderer>();
      registerElementRenderer("rectangle", renderer);
      let scene = emptyScene();
      ({ scene } = addElement(scene, placeRect("inside", 0, 0)));
      ({ scene } = addElement(scene, placeRect("outside", 1000, 1000)));
      const { target } = makeRecorder();
      renderScene(scene, target, {
        viewport: { x: -50, y: -50, width: 200, height: 200 },
      });
      expect(renderer).toHaveBeenCalledOnce();
    });

    it("renders all shapes when viewport is omitted", () => {
      const renderer = vi.fn<ElementRenderer>();
      registerElementRenderer("rectangle", renderer);
      let scene = emptyScene();
      ({ scene } = addElement(scene, placeRect("a", 0, 0)));
      ({ scene } = addElement(scene, placeRect("b", 10000, 10000)));
      const { target } = makeRecorder();
      renderScene(scene, target);
      expect(renderer).toHaveBeenCalledTimes(2);
    });

    it("spatialIndex pre-filters candidates", () => {
      const renderer = vi.fn<ElementRenderer>();
      registerElementRenderer("rectangle", renderer);
      let scene = emptyScene();
      ({ scene } = addElement(scene, placeRect("inside", 0, 0)));
      ({ scene } = addElement(scene, placeRect("outside", 5000, 5000)));
      const grid = buildSpatialIndex(scene);
      const { target } = makeRecorder();
      renderScene(scene, target, {
        viewport: { x: -50, y: -50, width: 100, height: 100 },
        spatialIndex: grid,
      });
      expect(renderer).toHaveBeenCalledOnce();
    });

    it("reuses bounds cache across calls", () => {
      const renderer = vi.fn<ElementRenderer>();
      registerElementRenderer("rectangle", renderer);
      let scene = emptyScene();
      ({ scene } = addElement(scene, placeRect("a", 0, 0)));
      const cache = new ElementCache<{ x: number; y: number; width: number; height: number }>();
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
        ({ scene } = addElement(scene, s));
      }
      return scene;
    };

    it("drops text whose on-screen font size is below minTextScreenPx", () => {
      const rectRenderer = vi.fn<ElementRenderer>();
      const textRenderer = vi.fn<ElementRenderer>();
      registerElementRenderer("rectangle", rectRenderer);
      registerElementRenderer("text", textRenderer);
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
      // 12 px × zoom 0.2 = 2.4 px on screen — unreadable, skipped.
      renderScene(scene, target, { lod: { minTextScreenPx: 6 } });
      expect(rectRenderer).toHaveBeenCalledOnce();
      expect(textRenderer).not.toHaveBeenCalled();
    });

    it("keeps large text readable at a tiny zoom (LOD is per element, not per zoom)", () => {
      const textRenderer = vi.fn<ElementRenderer>();
      registerElementRenderer("text", textRenderer);
      const scene = sceneWithZoom(0.01, [
        {
          id: elementId("h1"),
          layerId: DEFAULT_LAYER_ID,
          type: "text",
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          order: orderBetween(null, null),
          style: {},
          text: "HEADLINE",
          fontFamily: "sans",
          fontSize: 2000, // 20 px on screen at 1 %
        },
      ]);
      const { target } = makeRecorder();
      renderScene(scene, target, { lod: { minTextScreenPx: 6 } });
      expect(textRenderer).toHaveBeenCalledOnce();
    });

    it("placeholder skips renderers and emits world-bounds rect", () => {
      const rectRenderer = vi.fn<ElementRenderer>();
      registerElementRenderer("rectangle", rectRenderer);
      const scene = sceneWithZoom(0.1, [placeRect("a", 0, 0), placeRect("b", 100, 100)]);
      const { target, calls } = makeRecorder();
      // Both rects are far smaller than 1000 px on screen → flat fills.
      renderScene(scene, target, { lod: { placeholderMaxScreenPx: 1000 } });
      expect(rectRenderer).not.toHaveBeenCalled();
      const fills = calls.filter((c) => c.method === "fill").length;
      expect(fills).toBe(2);
    });

    it("keeps a shape that is still large on screen fully rendered at the same zoom", () => {
      const rectRenderer = vi.fn<ElementRenderer>();
      registerElementRenderer("rectangle", rectRenderer);
      const scene = sceneWithZoom(0.1, [
        { ...placeRect("big", 0, 0), width: 5000, height: 5000 } as Element, // 500 px on screen
        placeRect("small", 100, 100),
      ]);
      const { target } = makeRecorder();
      renderScene(scene, target, { lod: { placeholderMaxScreenPx: 20 } });
      expect(rectRenderer).toHaveBeenCalledOnce();
    });

    it("LOD inactive at high zoom — full render", () => {
      const rectRenderer = vi.fn<ElementRenderer>();
      registerElementRenderer("rectangle", rectRenderer);
      const scene = sceneWithZoom(1.5, [placeRect("a", 0, 0)]);
      const { target } = makeRecorder();
      renderScene(scene, target, { lod: { placeholderMaxScreenPx: 8, minTextScreenPx: 6 } });
      expect(rectRenderer).toHaveBeenCalledOnce();
    });
  });

  it("applies TRS transforms for each shape", () => {
    const renderer = vi.fn<ElementRenderer>();
    registerElementRenderer("trs-test", renderer);
    let scene = emptyScene();
    const r: Element = {
      ...rect("a"),
      type: "trs-test",
      position: { x: 5, y: 7 },
      rotation: Math.PI / 4,
      scale: { x: 2, y: 3 },
    };
    ({ scene } = addElement(scene, r));
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

  describe("dimElements / dimOpacity", () => {
    // A renderer that applies its shape's own opacity absolutely, exactly like
    // the built-in `applyStyle` does — this is what used to overwrite the dim.
    const opacityRenderer: ElementRenderer = (shape, target) => {
      const opacity = (shape as { style: { opacity?: number } }).style.opacity;
      if (opacity !== undefined) target.setOpacity(opacity);
      target.beginPath();
      target.fill();
    };
    const setOpacities = (calls: { method: string; args: readonly unknown[] }[]): number[] =>
      calls.filter((c) => c.method === "setOpacity").map((c) => c.args[0] as number);

    it("dims a plain shape (no own opacity) to dimOpacity", () => {
      registerElementRenderer("dim-plain", opacityRenderer);
      let scene = emptyScene();
      ({ scene } = addElement(scene, { ...rect("a"), type: "dim-plain" }));
      const { target, calls } = makeRecorder();
      renderScene(scene, target, { dimElements: new Set([elementId("a")]), dimOpacity: 0.2 });
      expect(setOpacities(calls)).toContain(0.2);
    });

    it("multiplies a shape's own opacity by dimOpacity instead of overwriting it", () => {
      registerElementRenderer("dim-own", opacityRenderer);
      let scene = emptyScene();
      const el: Element = { ...rect("a"), type: "dim-own", style: { fill: "#000", opacity: 0.5 } };
      ({ scene } = addElement(scene, el));
      const { target, calls } = makeRecorder();
      renderScene(scene, target, { dimElements: new Set([elementId("a")]), dimOpacity: 0.2 });
      const opacities = setOpacities(calls);
      // 0.5 (own) × 0.2 (dim) — dimmed AND semi-transparent, never full opacity.
      expect(opacities).toContain(0.5 * 0.2);
      expect(opacities).not.toContain(0.5);
    });

    it("leaves a non-dimmed shape's own opacity untouched", () => {
      registerElementRenderer("dim-other", opacityRenderer);
      let scene = emptyScene();
      const el: Element = {
        ...rect("a"),
        type: "dim-other",
        style: { fill: "#000", opacity: 0.5 },
      };
      ({ scene } = addElement(scene, el));
      const { target, calls } = makeRecorder();
      // Dim set targets a different id, so shape "a" renders at full own opacity.
      renderScene(scene, target, { dimElements: new Set([elementId("z")]), dimOpacity: 0.2 });
      expect(setOpacities(calls)).toContain(0.5);
    });
  });
});
