import { describe, expect, it } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import {
  addShape,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  removeShape,
  updateShape,
  type Shape,
} from "@oh-just-another/scene";
import { cachedWorldBounds, ShapeCache, sharedBoundsCache } from "../src/index";

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

describe("ShapeCache", () => {
  it("memoizes by shape identity", () => {
    const cache = new ShapeCache<number>();
    const s = rect("a");
    let calls = 0;
    const compute = (): number => {
      calls++;
      return 42;
    };
    expect(cache.getOrCompute(s, compute)).toBe(42);
    expect(cache.getOrCompute(s, compute)).toBe(42);
    expect(calls).toBe(1);
  });

  it("invalidates when the shape ref changes", () => {
    const cache = new ShapeCache<number>();
    const s1 = rect("a");
    cache.set(s1, 1);
    const s2 = { ...s1, position: { x: 5, y: 5 } };
    expect(cache.get(s2)).toBeUndefined();
  });

  it("explicit invalidate / clear", () => {
    const cache = new ShapeCache<number>();
    const s = rect("a");
    cache.set(s, 1);
    cache.invalidate(s.id);
    expect(cache.get(s)).toBeUndefined();
    cache.set(s, 1);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("prune drops entries not in scene", () => {
    const cache = new ShapeCache<number>();
    const s1 = rect("a");
    const s2 = rect("b");
    cache.set(s1, 1);
    cache.set(s2, 2);
    let scene = emptyScene();
    scene = addShape(scene, s1).scene;
    scene = addShape(scene, s2).scene;
    scene = removeShape(scene, s2.id).scene;
    cache.prune(scene);
    expect(cache.size).toBe(1);
    expect(cache.get(s1)).toBe(1);
  });
});

describe("cachedWorldBounds", () => {
  it("returns same bounds for stable shape", () => {
    const cache = new ShapeCache<ReturnType<typeof cachedWorldBounds>>();
    const s = rect("a", 5, 5, 10, 10);
    const a = cachedWorldBounds(cache, s);
    const b = cachedWorldBounds(cache, s);
    expect(a).toBe(b);
    expect(a).toEqual({ x: 5, y: 5, width: 10, height: 10 });
  });

  it("recomputes after updateShape changes the ref", () => {
    let scene = emptyScene();
    const id = elementId("a");
    scene = addShape(scene, {
      ...rect("a", 0, 0),
      id,
      layerId: layerId(DEFAULT_LAYER_ID),
    }).scene;
    const before = scene.shapes.get(id)!;
    const cache = new ShapeCache<ReturnType<typeof cachedWorldBounds>>();
    const b1 = cachedWorldBounds(cache, before);
    expect(b1.x).toBe(0);
    scene = updateShape(scene, id, (s) => ({ ...s, position: { x: 50, y: 50 } })).scene;
    const after = scene.shapes.get(id)!;
    expect(after).not.toBe(before);
    const b2 = cachedWorldBounds(cache, after);
    expect(b2.x).toBe(50);
  });
});

describe("sharedBoundsCache", () => {
  it("is a module-level singleton", () => {
    expect(sharedBoundsCache).toBeInstanceOf(ShapeCache);
  });
});
