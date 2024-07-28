import { describe, expect, it } from "vitest";
import { shapeId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addShape,
  emptyScene,
  orderBetween,
  type Scene,
  type Shape,
} from "@oh-just-another/scene";
import { renderToPng } from "../src/index";

const sceneOf = (width: number, height: number): Scene => {
  const s = emptyScene();
  return { ...s, viewport: { ...s.viewport, size: { width, height } } };
};

const rect = (id: string, x = 0, y = 0, w = 50, h = 30, fill = "#abc"): Shape => ({
  id: shapeId(id),
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

// PNG file signature: 137 80 78 71 13 10 26 10
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const isPng = (buf: Uint8Array): boolean => PNG_SIGNATURE.every((byte, i) => buf[i] === byte);

describe("renderToPng", () => {
  it("produces a valid PNG buffer", async () => {
    let scene = sceneOf(120, 80);
    ({ scene } = addShape(scene, rect("a", 10, 10, 100, 60)));
    const png = await renderToPng(scene);
    expect(png).toBeInstanceOf(Uint8Array);
    expect(png.length).toBeGreaterThan(64);
    expect(isPng(png)).toBe(true);
  });

  it("scale option produces a larger buffer (more pixels = more bytes)", async () => {
    let scene = sceneOf(120, 80);
    ({ scene } = addShape(scene, rect("a", 10, 10, 100, 60)));
    const png1x = await renderToPng(scene, { scale: 1 });
    const png2x = await renderToPng(scene, { scale: 2 });
    expect(png2x.length).toBeGreaterThan(png1x.length);
  });

  it("background option produces a different image", async () => {
    const scene = sceneOf(50, 50);
    const white = await renderToPng(scene, { background: "#ffffff" });
    const red = await renderToPng(scene, { background: "#ff0000" });
    expect(white).not.toEqual(red);
  });
});
