import { describe, expect, it, vi } from "vitest";
import { linkId, elementId } from "@oh-just-another/types";
import {
  addEdge,
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Edge,
  type Patch,
  type Shape,
} from "@oh-just-another/scene";
import { renderEdges, InMemoryEdgeBitmapCache } from "../src/index";

const rect = (id: string, x = 0, y = 0, w = 10, h = 10): Shape => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: w,
  height: h,
});

const sceneWithEdge = () => {
  let scene = apply(emptyScene(), {
    kind: "shape",
    id: rect("a").id,
    before: null,
    after: rect("a", 0, 0),
  } satisfies Patch);
  scene = apply(scene, {
    kind: "shape",
    id: rect("b").id,
    before: null,
    after: rect("b", 100, 100),
  } satisfies Patch);
  const edge: Edge = {
    id: linkId("e1"),
    layerId: DEFAULT_LAYER_ID,
    order: orderBetween(null, null),
    from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "center" } },
    to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "center" } },
    style: { stroke: "#000" },
  };
  const r = addEdge(scene, edge);
  return { scene: r.scene, edge };
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
  size: { width: 800, height: 600 },
});

describe("renderEdges + EdgeBitmapCache", () => {
  it("calls rasteriseEdge on first frame and caches the result", () => {
    const { scene } = sceneWithEdge();
    const target = stubTarget();
    const cache = new InMemoryEdgeBitmapCache<string>();
    const rasteriseEdge = vi.fn(() => "bitmap-A");

    renderEdges(scene, target as never, {
      edgeBitmapCache: cache,
      rasteriseEdge,
    });

    expect(rasteriseEdge).toHaveBeenCalledOnce();
    expect(target.drawImage).toHaveBeenCalledOnce();
    expect(target.stroke).not.toHaveBeenCalled();
  });

  it("uses cached bitmap on subsequent frame without re-rasterising", () => {
    const { scene } = sceneWithEdge();
    const target = stubTarget();
    const cache = new InMemoryEdgeBitmapCache<string>();
    const rasteriseEdge = vi.fn(() => "bitmap-A");

    renderEdges(scene, target as never, { edgeBitmapCache: cache, rasteriseEdge });
    renderEdges(scene, target as never, { edgeBitmapCache: cache, rasteriseEdge });

    expect(rasteriseEdge).toHaveBeenCalledOnce(); // only first frame
    expect(target.drawImage).toHaveBeenCalledTimes(2);
  });

  it("falls back to stroke path when rasteriseEdge returns null", () => {
    const { scene } = sceneWithEdge();
    const target = stubTarget();
    const cache = new InMemoryEdgeBitmapCache<string>();

    renderEdges(scene, target as never, {
      edgeBitmapCache: cache,
      rasteriseEdge: () => null,
    });

    expect(target.drawImage).not.toHaveBeenCalled();
    expect(target.stroke).toHaveBeenCalled();
  });

  it("no cache + no rasteriser → behaves exactly like the original path", () => {
    const { scene } = sceneWithEdge();
    const target = stubTarget();

    renderEdges(scene, target as never);

    expect(target.drawImage).not.toHaveBeenCalled();
    expect(target.stroke).toHaveBeenCalled();
  });
});
