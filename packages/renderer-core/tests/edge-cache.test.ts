import { describe, expect, it } from "vitest";
import { edgeId, shapeId } from "@oh-just-another/types";
import {
  addEdge,
  addShape,
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  updateShape,
  type Edge,
  type Patch,
  type Shape,
} from "@oh-just-another/scene";
import { computeEdgeWorldBounds, EdgeBoundsCache } from "../src/index";

const rect = (id: string, x = 0, y = 0, w = 10, h = 10): Shape => ({
  id: shapeId(id),
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

const sceneWithEdge = (edge: Edge): { scene: ReturnType<typeof emptyScene>; edge: Edge } => {
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
  const r = addEdge(scene, edge);
  return { scene: r.scene, edge };
};

const baseEdge: Edge = {
  id: edgeId("e1"),
  layerId: DEFAULT_LAYER_ID,
  order: orderBetween(null, null),
  from: { kind: "anchor", shapeId: shapeId("a"), anchor: { kind: "named", name: "center" } },
  to: { kind: "anchor", shapeId: shapeId("b"), anchor: { kind: "named", name: "center" } },
  style: {},
};

describe("EdgeBoundsCache", () => {
  it("computeEdgeWorldBounds returns the polyline AABB", () => {
    const { scene, edge } = sceneWithEdge(baseEdge);
    const b = computeEdgeWorldBounds(scene, edge);
    expect(b).not.toBeNull();
    expect(b!.x).toBeLessThanOrEqual(5);
    expect(b!.y).toBeLessThanOrEqual(5);
    expect(b!.width).toBeGreaterThan(0);
    expect(b!.height).toBeGreaterThan(0);
  });

  it("memoizes by (scene, edge) identity", () => {
    const { scene, edge } = sceneWithEdge(baseEdge);
    const cache = new EdgeBoundsCache();
    const first = cache.getOrCompute(scene, edge);
    const second = cache.getOrCompute(scene, edge);
    expect(second).toBe(first);
  });

  it("invalidates when the scene ref changes (shape move)", () => {
    const { scene, edge } = sceneWithEdge(baseEdge);
    const cache = new EdgeBoundsCache();
    const first = cache.getOrCompute(scene, edge);
    const moved = updateShape(scene, shapeId("b"), (s) => ({
      ...s,
      position: { x: 500, y: 500 },
    })).scene;
    // Edge ref unchanged, but scene ref differs — must recompute.
    const second = cache.getOrCompute(moved, edge);
    expect(second).not.toBe(first);
    expect(second!.x + second!.width).toBeGreaterThan(first!.x + first!.width);
  });

  it("prune drops entries whose edge is gone from the scene", () => {
    const { scene, edge } = sceneWithEdge(baseEdge);
    const cache = new EdgeBoundsCache();
    cache.getOrCompute(scene, edge);
    expect(cache.size).toBe(1);
    const removed = apply(scene, {
      kind: "edge",
      id: edge.id,
      before: edge,
      after: null,
    } satisfies Patch);
    cache.prune(removed);
    expect(cache.size).toBe(0);
  });
});
