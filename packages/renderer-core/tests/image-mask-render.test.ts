/**
 * Image masks: the renderer wraps drawImage in save / clip(mask path) /
 * restore, with the mask's normalised coordinates scaled to the element
 * box. `buildImageMaskPath` is the single path source (also used by
 * overlay previews).
 */
import { describe, expect, it, beforeAll } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  emptyScene,
  DEFAULT_LAYER_ID,
  orderBetween,
  type Element,
  type ImageMask,
} from "@oh-just-another/scene";
import { installBuiltinRenderers, renderScene, type RenderTarget } from "../src/index";

beforeAll(() => {
  installBuiltinRenderers();
});

class FakeBitmap {
  readonly width = 8;
  readonly height = 8;
}

const makeRecorder = () => {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const handler: ProxyHandler<object> = {
    get: (_t, prop: string) => {
      if (prop === "size") return { width: 200, height: 200 };
      if (prop === "then") return undefined;
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        if (prop === "measureText") return { width: 0 };
        return undefined;
      };
    },
  };
  return { target: new Proxy({}, handler) as unknown as RenderTarget, calls };
};

const image = (mask?: ImageMask): Element =>
  ({
    id: elementId("img"),
    layerId: DEFAULT_LAYER_ID,
    type: "image",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    src: "data:,",
    width: 100,
    height: 60,
    metadata: { image: new FakeBitmap() },
    ...(mask ? { mask } : {}),
  }) as unknown as Element;

const render = (el: Element) => {
  const { target, calls } = makeRecorder();
  let scene = emptyScene();
  ({ scene } = addElement(scene, el));
  renderScene(scene, target);
  return calls;
};

const seq = (calls: { method: string }[]) => calls.map((c) => c.method);

describe("image mask rendering", () => {
  beforeAll(() => {
    (globalThis as { ImageBitmap?: unknown }).ImageBitmap = FakeBitmap;
  });

  it("no mask → no clip", () => {
    const calls = render(image());
    expect(seq(calls)).not.toContain("clip");
    expect(seq(calls)).toContain("drawImage");
  });

  it("ellipse mask clips an inscribed ellipse around drawImage", () => {
    const calls = render(image({ kind: "ellipse" }));
    const names = seq(calls);
    const clipAt = names.indexOf("clip");
    expect(clipAt).toBeGreaterThan(-1);
    expect(names.indexOf("drawImage")).toBeGreaterThan(clipAt);
    expect(names.indexOf("restore")).toBeGreaterThan(names.indexOf("drawImage"));
    const ell = calls.find((c) => c.method === "ellipse");
    expect(ell?.args).toEqual([50, 30, 50, 30]); // centre + radii of the 100×60 box
  });

  it("polygon mask scales normalised points to the box", () => {
    const calls = render(
      image({
        kind: "polygon",
        points: [
          { x: 0.5, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      }),
    );
    const move = calls.find((c) => c.method === "moveTo");
    expect(move?.args).toEqual([50, 0]);
    const lines = calls.filter((c) => c.method === "lineTo").map((c) => c.args);
    expect(lines).toContainEqual([100, 60]);
    expect(lines).toContainEqual([0, 60]);
    expect(seq(calls)).toContain("clip");
  });

  it("round-rect mask radius is a fraction of the shorter side", () => {
    const calls = render(image({ kind: "round-rect", radius: 0.25 }));
    // buildRoundedRectPath starts at (x + r, y); shorter side 60 → r = 15.
    const move = calls.find((c) => c.method === "moveTo");
    expect(move?.args[0]).toBe(15);
    expect(seq(calls)).toContain("clip");
  });
});
