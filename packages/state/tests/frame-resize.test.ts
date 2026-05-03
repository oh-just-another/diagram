import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  getElementWorldBounds,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { computeElementResize } from "../src/editor/applies/resize.js";
import { hasWidthHeight } from "../src/editor/shape-traits.js";

const frame = (id: string, w: number, h: number): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "frame",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    width: w,
    height: h,
    name: "Frame 1",
  }) as unknown as Element;

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

describe("frame resize", () => {
  it("hasWidthHeight recognises frames", () => {
    expect(hasWidthHeight(frame("f", 200, 200))).toBe(true);
  });

  it("computeElementResize grows the frame's width/height", () => {
    const f = frame("f", 200, 200);
    const scene = sceneWith(f);
    const result = computeElementResize(
      scene,
      elementId("f"),
      "se",
      { x: 60, y: 40 },
      getElementWorldBounds(f),
      (_s, raw) => raw, // frame is not a container — no clamp
    );
    expect(result).not.toBeNull();
    const next = result!.scene.elements.get(elementId("f")) as Element & {
      width: number;
      height: number;
    };
    expect(next.width).toBe(260);
    expect(next.height).toBe(240);
  });
});
