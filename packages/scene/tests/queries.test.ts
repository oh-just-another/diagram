import { describe, expect, it } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import {
  addLayer,
  addElement,
  apply,
  buildSpatialIndex,
  DEFAULT_LAYER_ID,
  emptyScene,
  getLayer,
  getLayersInOrder,
  getElement,
  getElementAt,
  getElementAtIndexed,
  getElementsInBounds,
  getElementsInLayer,
  orderBetween,
  orderForTop,
  queryByIndex,
  updateLayer,
  type Layer,
  type Patch,
  type Element,
} from "../src/index";

const rect = (
  id: string,
  layer = DEFAULT_LAYER_ID,
  position = { x: 0, y: 0 },
  w = 10,
  h = 10,
): Element => ({
  id: elementId(id),
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
    it("getElement / getLayer return undefined for missing ids", () => {
      const s = emptyScene();
      expect(getElement(s, elementId("missing"))).toBeUndefined();
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

    it("getElementsInLayer is sorted bottom-to-top by `order`", () => {
      let { scene } = addElement(emptyScene(), { ...rect("a"), order: orderBetween(null, null) });
      const order2 = orderForTop(
        [...scene.shapes.values()]
          .filter((s) => s.layerId === DEFAULT_LAYER_ID)
          .map((s) => s.order),
      );
      ({ scene } = addElement(scene, { ...rect("b"), order: order2 }));
      const shapes = getElementsInLayer(scene, DEFAULT_LAYER_ID);
      expect(shapes.map((s) => s.id)).toEqual([elementId("a"), elementId("b")]);
    });
  });

  describe("getElementsInBounds (linear)", () => {
    const buildSpread = () => {
      let scene = emptyScene();
      for (let i = 0; i < 5; i++) {
        ({ scene } = addElement(scene, rect(`s${i}`, DEFAULT_LAYER_ID, { x: i * 100, y: 0 })));
      }
      return scene;
    };

    it("includes overlapping, excludes outside", () => {
      const scene = buildSpread();
      const hits = getElementsInBounds(scene, { x: -5, y: -5, width: 150, height: 50 });
      expect(hits.map((s) => s.id).sort()).toEqual([elementId("s0"), elementId("s1")]);
    });
  });

  describe("getElementAt", () => {
    it("returns the topmost visible shape at a point", () => {
      const a = rect("a", DEFAULT_LAYER_ID, { x: 0, y: 0 });
      const b: Element = {
        ...rect("b", DEFAULT_LAYER_ID, { x: 0, y: 0 }),
        order: orderBetween(a.order, null),
      };
      const start = emptyScene();
      const s1 = apply(start, { kind: "element", id: a.id, before: null, after: a } satisfies Patch);
      const s2 = apply(s1, { kind: "element", id: b.id, before: null, after: b } satisfies Patch);
      const hit = getElementAt(s2, { x: 5, y: 5 });
      // Both cover (5,5); `b` has higher order so it should win.
      expect(hit?.id).toBe(b.id);
    });
    it("ignores invisible layers", () => {
      const a = rect("a", DEFAULT_LAYER_ID, { x: 0, y: 0 });
      const s1 = apply(emptyScene(), {
        kind: "element",
        id: a.id,
        before: null,
        after: a,
      } satisfies Patch);
      const { scene: s2 } = updateLayer(s1, DEFAULT_LAYER_ID, (l) => ({ ...l, visible: false }));
      expect(getElementAt(s2, { x: 5, y: 5 })).toBeUndefined();
    });
    it("returns undefined for empty hit", () => {
      const scene = emptyScene();
      expect(getElementAt(scene, { x: 9999, y: 9999 })).toBeUndefined();
    });
  });

  describe("spatial index", () => {
    it("query matches linear scan", () => {
      let scene = emptyScene();
      for (let i = 0; i < 50; i++) {
        ({ scene } = addElement(scene, rect(`s${i}`, DEFAULT_LAYER_ID, { x: i * 20, y: 0 })));
      }
      const range = { x: 100, y: -5, width: 100, height: 50 };
      const grid = buildSpatialIndex(scene, 50);
      const indexHits = new Set(queryByIndex(scene, grid, range).map((s) => s.id));
      const linearHits = new Set(getElementsInBounds(scene, range).map((s) => s.id));
      expect(indexHits).toEqual(linearHits);
    });

    it("getElementAtIndexed matches getElementAt for every probe", () => {
      let scene = emptyScene();
      for (let i = 0; i < 40; i++) {
        ({ scene } = addElement(
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
        expect(getElementAtIndexed(scene, grid, probe)?.id).toEqual(getElementAt(scene, probe)?.id);
      }
    });

    it("getElementAtIndexed respects layer visibility and z-order", () => {
      const a = rect("a", DEFAULT_LAYER_ID, { x: 0, y: 0 });
      const b: Element = {
        ...rect("b", DEFAULT_LAYER_ID, { x: 0, y: 0 }),
        order: orderBetween(a.order, null),
      };
      let scene = apply(emptyScene(), {
        kind: "element",
        id: a.id,
        before: null,
        after: a,
      } satisfies Patch);
      scene = apply(scene, {
        kind: "element",
        id: b.id,
        before: null,
        after: b,
      } satisfies Patch);
      const grid = buildSpatialIndex(scene);
      expect(getElementAtIndexed(scene, grid, { x: 5, y: 5 })?.id).toBe(b.id);
    });
  });
});
