import { describe, expect, it } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  SnapEngine,
  addShape,
  anchorSnapper,
  emptyScene,
  gridSnapper,
  orderBetween,
  type RectangleShape,
  type Scene,
  type SnapContext,
} from "../src/index";

const rect = (id: string, x: number, y: number, w = 100, h = 60): RectangleShape => ({
  id: elementId(id),
  layerId: layerId(DEFAULT_LAYER_ID),
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#fff" },
  width: w,
  height: h,
});

const withGrid = (size: number, shapes: RectangleShape[] = []): Scene => {
  let s = emptyScene();
  s = { ...s, viewport: { ...s.viewport, gridSize: size } };
  for (const sh of shapes) ({ scene: s } = addShape(s, sh));
  return s;
};

const ctx = (scene: Scene, probe: { x: number; y: number }, threshold = 8): SnapContext => ({
  scene,
  probe,
  threshold,
  gesture: "draw-edge",
});

describe("gridSnapper", () => {
  it("snaps the probe to the nearest grid intersection", () => {
    const out = gridSnapper.contribute(ctx(withGrid(10), { x: 23, y: 47 }));
    expect(out).toEqual([
      {
        snapped: { x: 20, y: 50 },
        distance: 9 + 9, // dx=3, dy=3
        kind: "grid",
      },
    ]);
  });

  it("returns nothing when the viewport has no gridSize", () => {
    expect(gridSnapper.contribute(ctx(emptyScene(), { x: 5, y: 5 }))).toEqual([]);
  });
});

describe("anchorSnapper", () => {
  it("offers the nearest anchor of every shape with the right metadata", () => {
    const r = rect("a", 100, 100);
    const out = anchorSnapper.contribute(ctx(withGrid(0, [r]), { x: 200, y: 130 }));
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("anchor");
    expect(out[0]?.snapped).toEqual({ x: 200, y: 130 });
    expect(out[0]?.metadata).toMatchObject({
      elementId: r.id,
      ref: { kind: "named", name: "right" },
    });
  });

  it("skips excluded shapes", () => {
    const r = rect("a", 100, 100);
    const out = anchorSnapper.contribute({
      ...ctx(withGrid(0, [r]), { x: 200, y: 130 }),
      excludeShapeIds: new Set([r.id]),
    });
    expect(out).toEqual([]);
  });

  it("only fires for edge gestures", () => {
    const r = rect("a", 100, 100);
    const out = anchorSnapper.contribute({
      ...ctx(withGrid(0, [r]), { x: 200, y: 130 }),
      gesture: "move-shape",
    });
    expect(out).toEqual([]);
  });
});

describe("SnapEngine", () => {
  it("returns the closest candidate as best and sorts the rest", () => {
    const r = rect("a", 100, 100);
    const engine = new SnapEngine([gridSnapper, anchorSnapper]);
    // probe close to the right edge centre (anchor at 200,130) and the
    // grid intersection (200, 130) — both candidates land at the same
    // snapped point.
    const result = engine.snap(ctx(withGrid(10, [r]), { x: 199, y: 131 }, 50));
    expect(result.best).not.toBeNull();
    expect(result.all.length).toBeGreaterThanOrEqual(2);
    expect(result.all[0]!.distance).toBeLessThanOrEqual(result.all[1]!.distance);
  });

  it("drops candidates outside the threshold", () => {
    const r = rect("a", 100, 100);
    const engine = new SnapEngine([anchorSnapper]);
    // probe far away from any anchor on `r` — threshold rejects.
    const result = engine.snap(ctx(withGrid(0, [r]), { x: 500, y: 500 }, 5));
    expect(result.best).toBeNull();
    expect(result.all).toEqual([]);
  });
});
