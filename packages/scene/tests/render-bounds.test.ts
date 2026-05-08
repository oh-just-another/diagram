import { describe, expect, it } from "vitest";
import { elementId, layerId } from "@oh-just-another/types";
import { DEFAULT_LAYER_ID, orderBetween } from "../src/index";
import {
  getElementRenderBounds,
  registerRenderOverflow,
  registerBounder,
  getElementWorldBounds,
  type RectangleElement,
} from "../src/index";

// Test-only element types need a bounder so getElementWorldBounds resolves.
const wh = (s: { width: number; height: number }) => ({ x: 0, y: 0, width: s.width, height: s.height });
registerBounder("overflow-test", wh as never);
registerBounder("maybe-overflow", wh as never);

const rect = (x: number, y: number, w: number, h: number): RectangleElement => ({
  id: elementId("r"),
  layerId: layerId(DEFAULT_LAYER_ID),
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: w,
  height: h,
});

describe("getElementRenderBounds", () => {
  it("equals world bounds when no overflow is registered", () => {
    const r = rect(10, 20, 100, 50);
    expect(getElementRenderBounds(r)).toEqual(getElementWorldBounds(r));
  });

  it("expands by the registered per-side overflow", () => {
    // Use a dedicated type so we don't perturb other tests' "rectangle".
    const r = { ...rect(10, 20, 100, 50), type: "overflow-test" } as unknown as RectangleElement;
    registerRenderOverflow("overflow-test", () => ({ top: 24, left: 5, right: 5, bottom: 0 }));
    expect(getElementRenderBounds(r)).toEqual({ x: 5, y: -4, width: 110, height: 74 });
  });

  it("can vary overflow by shape (e.g. only tagged shapes overflow)", () => {
    registerRenderOverflow("maybe-overflow", (s) =>
      (s.metadata as { big?: boolean } | undefined)?.big ? { top: 100 } : {},
    );
    const plain = { ...rect(0, 0, 10, 10), type: "maybe-overflow" } as unknown as RectangleElement;
    const big = {
      ...rect(0, 0, 10, 10),
      type: "maybe-overflow",
      metadata: { big: true },
    } as unknown as RectangleElement;
    expect(getElementRenderBounds(plain)).toEqual(getElementWorldBounds(plain));
    expect(getElementRenderBounds(big).y).toBe(-100);
    expect(getElementRenderBounds(big).height).toBe(110);
  });
});
