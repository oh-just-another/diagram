import { afterEach, describe, expect, it, vi } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { installBuiltinRenderers } from "@oh-just-another/renderer-canvas";
import { exportSceneToPng } from "../src/png-export";

installBuiltinRenderers();

const rectAt = (id: string, x: number, y: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#abc" },
  width: 50,
  height: 50,
});

const sceneWith = (shapes: Element[], gridSize?: number): Scene => {
  let scene = emptyScene();
  for (const s of shapes) scene = addElement(scene, s).scene;
  return gridSize === undefined ? scene : { ...scene, viewport: { ...scene.viewport, gridSize } };
};

interface Call {
  method: string;
  args: unknown[];
}

// OffscreenCanvas mock that RECORDS every 2D-context call + property set, so
// tests can assert the export actually drove the canvas (background fill,
// grid pass, canvas dimensions) rather than just "a blob came back".
let lastDims: { w: number; h: number } | null = null;

class FakeOffscreenCanvas {
  log: Call[] = [];
  constructor(
    public width: number,
    public height: number,
  ) {
    lastDims = { w: width, h: height };
  }
  getContext(): unknown {
    return new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "canvas") return this;
          if (prop === "measureText") return () => ({ width: 0 });
          if (prop === "getTransform")
            return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, is2D: true, isIdentity: true });
          return (...args: unknown[]): undefined => {
            this.log.push({ method: String(prop), args });
            return undefined;
          };
        },
        set: (_t, prop, value) => {
          this.log.push({ method: `set:${String(prop)}`, args: [value] });
          return true;
        },
      },
    );
  }
  convertToBlob(): Promise<Blob> {
    return Promise.resolve(new Blob([new Uint8Array([1])], { type: "image/png" }));
  }
}

// Capture the live FakeOffscreenCanvas instance the code under test creates.
let created: FakeOffscreenCanvas[] = [];
class TrackingOffscreenCanvas extends FakeOffscreenCanvas {
  constructor(w: number, h: number) {
    super(w, h);
    created.push(this);
  }
}

const OPTS = { background: "transparent", scale: 2, backgroundColor: "#ff0000" } as const;

afterEach(() => {
  vi.unstubAllGlobals();
  lastDims = null;
  created = [];
});

describe("exportSceneToPng — guards", () => {
  it("returns null when OffscreenCanvas is unavailable", async () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    expect(await exportSceneToPng(sceneWith([rectAt("r", 10, 10)]), OPTS)).toBeNull();
  });

  it("returns null for an empty scene (no shapes → no bbox)", async () => {
    vi.stubGlobal("OffscreenCanvas", TrackingOffscreenCanvas);
    expect(await exportSceneToPng(emptyScene(), OPTS)).toBeNull();
    expect(created).toHaveLength(0); // bailed before constructing a canvas
  });
});

describe("exportSceneToPng — framing math", () => {
  it("sizes the canvas to the padded bbox × scale (single shape)", async () => {
    vi.stubGlobal("OffscreenCanvas", TrackingOffscreenCanvas);
    // rect (10,10) 50×50 → bbox (10,10,50,50); +20 padding each side → 90×90;
    // ×2 scale → 180×180.
    await exportSceneToPng(sceneWith([rectAt("r", 10, 10)]), OPTS);
    expect(lastDims).toEqual({ w: 180, h: 180 });
  });

  it("unions multiple shapes' bounds before framing", async () => {
    vi.stubGlobal("OffscreenCanvas", TrackingOffscreenCanvas);
    // (10,10,50,50) ∪ (200,300,50,50) → (10,10,240,340); +40 → 280×380; ×2 → 560×760.
    await exportSceneToPng(sceneWith([rectAt("a", 10, 10), rectAt("b", 200, 300)]), OPTS);
    expect(lastDims).toEqual({ w: 560, h: 760 });
  });
});

describe("exportSceneToPng — variants", () => {
  // Each variant adds a drawing pass on top of the previous, so the recorded
  // call count strictly increases: transparent (shapes only) < color
  // (+ background fill) < color-and-grid (+ grid pass). Asserting the
  // ordering distinguishes the three variants without depending on how
  // Canvas2DTarget maps its calls onto the raw 2D context.
  const callsFor = async (background: string, gridSize?: number): Promise<number> => {
    created = [];
    const blob = await exportSceneToPng(sceneWith([rectAt("r", 10, 10)], gridSize), {
      ...OPTS,
      background: background as typeof OPTS.background,
    });
    expect(blob).toBeInstanceOf(Blob);
    return created[0]!.log.length;
  };

  it("each variant adds a drawing pass (transparent < color < color-and-grid)", async () => {
    vi.stubGlobal("OffscreenCanvas", TrackingOffscreenCanvas);
    const transparent = await callsFor("transparent");
    const color = await callsFor("color");
    const colorAndGrid = await callsFor("color-and-grid", 20);
    expect(color).toBeGreaterThan(transparent);
    expect(colorAndGrid).toBeGreaterThan(color);
  });

  it("color-and-grid skips the grid pass when there is no grid (gridSize 0)", async () => {
    vi.stubGlobal("OffscreenCanvas", TrackingOffscreenCanvas);
    const withGrid = await callsFor("color-and-grid", 20);
    // gridSize 0 = no grid (emptyScene now ships the default grid).
    const withoutGrid = await callsFor("color-and-grid", 0);
    expect(withGrid).toBeGreaterThan(withoutGrid);
  });
});
