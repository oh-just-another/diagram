import { bench, describe } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addShape,
  buildSpatialIndex,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
  type SpatialGrid,
} from "@oh-just-another/scene";
import { installBuiltinRenderers, renderScene, ShapeCache, type RenderTarget } from "../src/index";

installBuiltinRenderers();

// No-op target — measures pure dispatch + cull cost, not Canvas2D.
const nullTarget: RenderTarget = new Proxy(
  {},
  {
    get: (_t, prop: string) => {
      if (prop === "size") return { width: 1920, height: 1080 };
      if (prop === "then") return undefined;
      return () => undefined;
    },
  },
) as unknown as RenderTarget;

const makeScene = (count: number, gridStep = 60): Scene => {
  let scene = emptyScene();
  scene = {
    ...scene,
    viewport: { ...scene.viewport, size: { width: 1920, height: 1080 } },
  };
  const cols = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const shape: Element = {
      id: elementId(`s-${i}`),
      layerId: DEFAULT_LAYER_ID,
      type: i % 2 === 0 ? "rectangle" : "ellipse",
      position: { x: (i % cols) * gridStep, y: Math.floor(i / cols) * gridStep },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: { fill: "#1a73e8", stroke: "#333", strokeWidth: 1 },
      width: 40,
      height: 30,
    };
    ({ scene } = addShape(scene, shape));
  }
  return scene;
};

interface Setup {
  scene: Scene;
  index: SpatialGrid;
  cache: ShapeCache<{ x: number; y: number; width: number; height: number }>;
}

const setupFor = (count: number): Setup => {
  const scene = makeScene(count);
  return {
    scene,
    index: buildSpatialIndex(scene),
    cache: new ShapeCache(),
  };
};

const setups = {
  1000: setupFor(1000),
  5000: setupFor(5000),
  10000: setupFor(10000),
  50000: setupFor(50000),
};

const viewport = { x: 0, y: 0, width: 800, height: 600 };

describe("renderScene — no culling", () => {
  bench("1k", () => renderScene(setups[1000].scene, nullTarget));
  bench("5k", () => renderScene(setups[5000].scene, nullTarget));
  bench("10k", () => renderScene(setups[10000].scene, nullTarget));
  bench("50k", () => renderScene(setups[50000].scene, nullTarget));
});

describe("renderScene — viewport culling (no index)", () => {
  bench("1k", () => renderScene(setups[1000].scene, nullTarget, { viewport }));
  bench("5k", () => renderScene(setups[5000].scene, nullTarget, { viewport }));
  bench("10k", () =>
    renderScene(setups[10000].scene, nullTarget, { viewport, boundsCache: setups[10000].cache }),
  );
  bench("50k", () =>
    renderScene(setups[50000].scene, nullTarget, { viewport, boundsCache: setups[50000].cache }),
  );
});

describe("renderScene — viewport culling + spatial index", () => {
  bench("1k", () =>
    renderScene(setups[1000].scene, nullTarget, { viewport, spatialIndex: setups[1000].index }),
  );
  bench("5k", () =>
    renderScene(setups[5000].scene, nullTarget, { viewport, spatialIndex: setups[5000].index }),
  );
  bench("10k", () =>
    renderScene(setups[10000].scene, nullTarget, {
      viewport,
      spatialIndex: setups[10000].index,
      boundsCache: setups[10000].cache,
    }),
  );
  bench("50k", () =>
    renderScene(setups[50000].scene, nullTarget, {
      viewport,
      spatialIndex: setups[50000].index,
      boundsCache: setups[50000].cache,
    }),
  );
});

describe("renderScene — LOD placeholder (zoom 0.1)", () => {
  const zoomed = (s: Scene): Scene => ({
    ...s,
    viewport: { ...s.viewport, zoom: 0.1 },
  });
  bench("10k", () =>
    renderScene(zoomed(setups[10000].scene), nullTarget, {
      lod: { placeholder: 0.2 },
      boundsCache: setups[10000].cache,
    }),
  );
  bench("50k", () =>
    renderScene(zoomed(setups[50000].scene), nullTarget, {
      lod: { placeholder: 0.2 },
      boundsCache: setups[50000].cache,
    }),
  );
});
