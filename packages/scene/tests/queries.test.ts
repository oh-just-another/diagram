import { describe, expect, it } from "vitest";
import { layerId, shapeId } from "@oh-just-another/types";
import {
  addLayer,
  addShape,
  apply,
  buildSpatialIndex,
  DEFAULT_LAYER_ID,
  emptyScene,
  getLayer,
  getLayersInOrder,
  getShape,
  getShapeAt,
  getShapeAtIndexed,
  getShapesInBounds,
  getShapesInLayer,
  orderBetween,
  orderForTop,
  queryByIndex,
  updateLayer,
  type Layer,
  type Patch,
  type Shape,
} from "../src/index";

const rect = (
  id: string,
  layer = DEFAULT_LAYER_ID,
  position = { x: 0, y: 0 },
  w = 10,
  h = 10,
): Shape => ({
  id: shapeId(id),
  layerId: layer,
  type: "rectangle",
  position,
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: w,
  height: h,
});

describe("queries", () => {
  describe("direct lookups", () => {
    it("getShape / getLayer return undefined for missing ids", () => {
      const s = emptyScene();
      expect(getShape(s, shapeId("missing"))).toBeUndefined();
      expect(getLayer(s, layerId("missing"))).toBeUndefined();
      expect(getLayer(s, DEFAULT_LAYER_ID)?.id).toBe(DEFAULT_LAYER_ID);
    });
  });

  describe("z-order", () => {
    it("getLayersInOrder returns layers sorted by `order` (bottom → top)", () => {
      const start = emptyScene();
      // Default layer already exists; add two more with controlled orders.
      const defaultOrder = getLayer(start, DEFAULT_LAYER_ID)!.order;
      const below: Layer = {
        id: layerId("below"),
        name: "Below",
        visible: true,
        locked: false,
        order: orderBetween(null, defaultOrder),
      };
      const above: Layer = {
        id: layerId("above"),
        name: "Above",
        visible: true,
        locked: false,
        order: orderBetween(defaultOrder, null),
      };
      const { scene: s1 } = addLayer(start, below);
      const { scene: s2 } = addLayer(s1, above);
      const ordered = getLayersInOrder(s2);
      expect(ordered.map((l) => l.id)).toEqual([below.id, DEFAULT_LAYER_ID, above.id]);
    });

    it("getShapesInLayer is sorted bottom-to-top by `order`", () => {
      let { scene } = addShape(emptyScene(), { ...rect("a"), order: orderBetween(null, null) });
      const order2 = orderForTop(
        [...scene.shapes.values()]
          .filter((s) => s.layerId === DEFAULT_LAYER_ID)
          .map((s) => s.order),
      );
      ({ scene } = addShape(scene, { ...rect("b"), order: order2 }));
      const shapes = getShapesInLayer(scene, DEFAULT_LAYER_ID);
      expect(shapes.map((s) => s.id)).toEqual([shapeId("a"), shapeId("b")]);
    });
  });

  describe("getShapesInBounds (linear)", () => {
    const buildSpread = () => {
      let scene = emptyScene();
      for (let i = 0; i < 5; i++) {
        ({ scene } = addShape(scene, rect(`s${i}`, DEFAULT_LAYER_ID, { x: i * 100, y: 0 })));
      }
      return scene;
    };

    it("includes overlapping, excludes outside", () => {
      const scene = buildSpread();
      const hits = getShapesInBounds(scene, { x: -5, y: -5, width: 150, height: 50 });
      expect(hits.map((s) => s.id).sort()).toEqual([shapeId("s0"), shapeId("s1")]);
    });
  });

  describe("getShapeAt", () => {
    it("returns the topmost visible shape at a point", () => {
      const a = rect("a", DEFAULT_LAYER_ID, { x: 0, y: 0 });
      const b: Shape = {
        ...rect("b", DEFAULT_LAYER_ID, { x: 0, y: 0 }),
        order: orderBetween(a.order, null),
      };
      const start = emptyScene();
      const s1 = apply(start, { kind: "shape", id: a.id, before: null, after: a } satisfies Patch);
      const s2 = apply(s1, { kind: "shape", id: b.id, before: null, after: b } satisfies Patch);
      const hit = getShapeAt(s2, { x: 5, y: 5 });
      // Both cover (5,5); `b` has higher order so it should win.
      expect(hit?.id).toBe(b.id);
    });
    it("ignores invisible layers", () => {
      const a = rect("a", DEFAULT_LAYER_ID, { x: 0, y: 0 });
      const s1 = apply(emptyScene(), {
        kind: "shape",
        id: a.id,
        before: null,
        after: a,
      } satisfies Patch);
      const { scene: s2 } = updateLayer(s1, DEFAULT_LAYER_ID, (l) => ({ ...l, visible: false }));
      expect(getShapeAt(s2, { x: 5, y: 5 })).toBeUndefined();
    });
    it("returns undefined for empty hit", () => {
      const scene = emptyScene();
      expect(getShapeAt(scene, { x: 9999, y: 9999 })).toBeUndefined();
    });
  });

  describe("spatial index", () => {
    it("query matches linear scan", () => {
      let scene = emptyScene();
      for (let i = 0; i < 50; i++) {
        ({ scene } = addShape(scene, rect(`s${i}`, DEFAULT_LAYER_ID, { x: i * 20, y: 0 })));
      }
      const range = { x: 100, y: -5, width: 100, height: 50 };
      const grid = buildSpatialIndex(scene, 50);
      const indexHits = new Set(queryByIndex(scene, grid, range).map((s) => s.id));
      const linearHits = new Set(getShapesInBounds(scene, range).map((s) => s.id));
      expect(indexHits).toEqual(linearHits);
    });

    it("getShapeAtIndexed matches getShapeAt for every probe", () => {
      let scene = emptyScene();
      for (let i = 0; i < 40; i++) {
        ({ scene } = addShape(
          scene,
          rect(`s${i}`, DEFAULT_LAYER_ID, { x: i * 25, y: (i % 3) * 25 }),
        ));
      }
      const grid = buildSpatialIndex(scene, 50);
      for (const probe of [
        { x: 5, y: 5 },
        { x: 27, y: 28 },
        { x: 999, y: 999 },
        { x: 100, y: 0 },
        { x: 175, y: 50 },
      ]) {
        expect(getShapeAtIndexed(scene, grid, probe)?.id).toEqual(getShapeAt(scene, probe)?.id);
      }
    });

    it("getShapeAtIndexed respects layer visibility and z-order", () => {
      const a = rect("a", DEFAULT_LAYER_ID, { x: 0, y: 0 });
      const b: Shape = {
        ...rect("b", DEFAULT_LAYER_ID, { x: 0, y: 0 }),
        order: orderBetween(a.order, null),
      };
      let scene = apply(emptyScene(), {
        kind: "shape",
        id: a.id,
        before: null,
        after: a,
      } satisfies Patch);
      scene = apply(scene, {
        kind: "shape",
        id: b.id,
        before: null,
        after: b,
      } satisfies Patch);
      const grid = buildSpatialIndex(scene);
      expect(getShapeAtIndexed(scene, grid, { x: 5, y: 5 })?.id).toBe(b.id);
    });
  });
});
