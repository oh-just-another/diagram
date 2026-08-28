import { bench, describe } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  buildSpatialIndex,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
  type SpatialGrid,
} from "@oh-just-another/scene";
import {
  installBuiltinRenderers,
  renderScene,
  ElementCache,
  type RenderTarget,
} from "../src/index";

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
    ({ scene } = addElement(scene, shape));
  }
  return scene;
};

interface Setup {
  scene: Scene;
  index: SpatialGrid;
  cache: ElementCache<{ x: number; y: number; width: number; height: number }>;
}

const setupFor = (count: number): Setup => {
  const scene = makeScene(count);
  return {
    scene,
    index: buildSpatialIndex(scene),
    cache: new ElementCache(),
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
      lod: { placeholderMaxScreenPx: 1000 },
      boundsCache: setups[10000].cache,
    }),
  );
  bench("50k", () =>
    renderScene(zoomed(setups[50000].scene), nullTarget, {
      lod: { placeholderMaxScreenPx: 1000 },
      boundsCache: setups[50000].cache,
    }),
  );
});

// ---------------------------------------------------------------------------
// Text LOD ladder — the render budget's only automatic step. A text-heavy
// mix (standalone text + labelled shapes) rendered at a zoom where the body
// text is ~8 px on screen, with the `minTextScreenPx` threshold stepped up:
// 0 (never skip) → 6 (default) → 10 → 14 → 20.
// ---------------------------------------------------------------------------

const textTarget: RenderTarget = new Proxy(
  {},
  {
    get: (_t, prop: string) => {
      if (prop === "size") return { width: 1920, height: 1080 };
      if (prop === "measureText") return (s: string) => ({ width: s.length * 7 });
      if (prop === "then") return undefined;
      return () => undefined;
    },
  },
) as unknown as RenderTarget;

const makeTextScene = (count: number, gridStep = 120): Scene => {
  let scene = emptyScene();
  scene = {
    ...scene,
    viewport: { ...scene.viewport, size: { width: 1920, height: 1080 }, zoom: 0.5 },
  };
  const cols = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const position = { x: (i % cols) * gridStep, y: Math.floor(i / cols) * gridStep };
    const base = {
      id: elementId(`t-${i}`),
      layerId: DEFAULT_LAYER_ID,
      position,
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
    };
    const shape: Element =
      i % 3 === 0
        ? ({
            ...base,
            type: "text",
            style: { fill: "#222" },
            text: `Note ${String(i)} — lorem ipsum dolor sit amet`,
            fontFamily: "system-ui",
            fontSize: 16,
            maxWidth: 100,
          } as unknown as Element)
        : ({
            ...base,
            type: i % 3 === 1 ? "rectangle" : "ellipse",
            style: { fill: "#e8f0fe", stroke: "#333", strokeWidth: 1 },
            width: 100,
            height: 60,
            label: { text: `Step ${String(i)}`, fontFamily: "system-ui", fontSize: 16 },
          } as unknown as Element);
    ({ scene } = addElement(scene, shape));
  }
  return scene;
};

const textSetups = { 10000: makeTextScene(10000), 50000: makeTextScene(50000) };
type BoundsCache = ElementCache<{ x: number; y: number; width: number; height: number }>;
const textCaches: Record<10000 | 50000, BoundsCache> = {
  10000: new ElementCache(),
  50000: new ElementCache(),
};

for (const count of [10000, 50000] as const) {
  describe(`renderScene — text LOD ladder, ${String(count / 1000)}k mixed (zoom 0.5)`, () => {
    for (const px of [0, 6, 10, 14, 20]) {
      bench(`minTextScreenPx=${String(px)}`, () =>
        renderScene(textSetups[count], textTarget, {
          lod: { placeholderMaxScreenPx: 8, ...(px > 0 ? { minTextScreenPx: px } : {}) },
          boundsCache: textCaches[count],
        }),
      );
    }
  });
}
