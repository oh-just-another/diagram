import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  type Element,
  type Patch,
  type Scene,
} from "@oh-just-another/scene";
import { computeSceneDirtyRect } from "../src/editor/dirty-rect.js";

const rect = (id: string, x: number, y: number, w = 50, h = 50): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: `a${id}` as Element["order"],
  style: { fill: "#000" },
  width: w,
  height: h,
});

const sceneOf = (shapes: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of shapes) {
    s = apply(s, { kind: "element", id: sh.id, before: null, after: sh } satisfies Patch);
  }
  return s;
};

describe("computeSceneDirtyRect", () => {
  it("returns the empty off-screen sentinel when the scene is reference-equal", () => {
    const s = sceneOf([rect("a", 0, 0)]);
    const { world, tileDirty } = computeSceneDirtyRect(s, s);
    expect(world).toEqual({ x: -1e9, y: -1e9, width: 0, height: 0 });
    expect(tileDirty.size).toBe(0);
  });

  it("covers a moved shape's before AND after bounds", () => {
    const prev = sceneOf([rect("a", 0, 0)]);
    const moved = { ...rect("a", 200, 200), order: prev.elements.get(elementId("a"))!.order };
    const next = apply(prev, {
      kind: "element",
      id: elementId("a"),
      before: prev.elements.get(elementId("a"))!,
      after: moved,
    });
    const { world, tileDirty } = computeSceneDirtyRect(prev, next);
    // union of [0,0,50,50] and [200,200,50,50], inflated by 4
    expect(world.x).toBeLessThanOrEqual(0);
    expect(world.y).toBeLessThanOrEqual(0);
    expect(world.x + world.width).toBeGreaterThanOrEqual(250);
    expect(world.y + world.height).toBeGreaterThanOrEqual(250);
    const entry = tileDirty.get(elementId("a"));
    expect(entry?.before).not.toBeNull();
    expect(entry?.after).not.toBeNull();
  });

  it("records a removed shape with after=null", () => {
    const a = rect("a", 0, 0);
    const prev = sceneOf([a]);
    const next = apply(prev, { kind: "element", id: a.id, before: a, after: null });
    const { tileDirty } = computeSceneDirtyRect(prev, next);
    expect(tileDirty.get(a.id)?.after).toBeNull();
    expect(tileDirty.get(a.id)?.before).not.toBeNull();
  });

  it("transitively pulls in a shape overlapping the dirty rect", () => {
    // 'a' moves; 'b' overlaps a's new position but wasn't itself changed —
    // it must still land in the dirty rect via transitive expansion.
    const a = rect("a", 0, 0);
    const b = rect("b", 210, 210);
    const prev = sceneOf([a, b]);
    const moved = { ...rect("a", 200, 200), order: a.order };
    const next = apply(prev, { kind: "element", id: a.id, before: a, after: moved });
    const { world } = computeSceneDirtyRect(prev, next);
    // b's bounds [210..260] must be inside the dirty rect.
    expect(world.x + world.width).toBeGreaterThanOrEqual(260);
    expect(world.y + world.height).toBeGreaterThanOrEqual(260);
  });
});
