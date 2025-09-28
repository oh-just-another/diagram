import { describe, expect, it } from "vitest";
import { linkId, layerId, elementId } from "@oh-just-another/types";
import {
  addLink,
  addLayer,
  addShape,
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  invert,
  moveShape,
  orderBetween,
  removeLink,
  removeLayer,
  removeShape,
  setViewport,
  updateLayer,
  updateShape,
  type Link,
  type Layer,
  type Element,
  type Viewport,
} from "../src/index";

const rect = (id: string, x = 0, y = 0): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 10,
  height: 10,
});

describe("operations", () => {
  describe("addShape", () => {
    it("adds and returns inverse-able patch", () => {
      const { scene, patch } = addShape(emptyScene(), rect("a"));
      expect(scene.shapes.size).toBe(1);
      const back = apply(scene, invert(patch));
      expect(back.shapes.size).toBe(0);
    });
    it("throws on duplicate id", () => {
      const { scene } = addShape(emptyScene(), rect("a"));
      expect(() => addShape(scene, rect("a"))).toThrow(/already exists/i);
    });
  });

  describe("removeShape", () => {
    it("removes existing shape", () => {
      const { scene } = addShape(emptyScene(), rect("a"));
      const { scene: removed, patch } = removeShape(scene, elementId("a"));
      expect(removed.shapes.has(elementId("a"))).toBe(false);
      const restored = apply(removed, invert(patch));
      expect(restored.shapes.has(elementId("a"))).toBe(true);
    });
    it("throws on missing id", () => {
      expect(() => removeShape(emptyScene(), elementId("missing"))).toThrow(/not found/i);
    });
  });

  describe("updateShape", () => {
    it("applies the update function and produces invertible patch", () => {
      const { scene } = addShape(emptyScene(), rect("a"));
      const { scene: moved, patch } = updateShape(scene, elementId("a"), (s) => ({
        ...s,
        position: { x: 5, y: 7 },
      }));
      expect(moved.shapes.get(elementId("a"))?.position).toEqual({ x: 5, y: 7 });
      const back = apply(moved, invert(patch));
      expect(back.shapes.get(elementId("a"))?.position).toEqual({ x: 0, y: 0 });
    });
  });

  describe("moveShape", () => {
    it("shortcut for updating position", () => {
      const { scene } = addShape(emptyScene(), rect("a"));
      const { scene: moved } = moveShape(scene, elementId("a"), { x: 3, y: 4 });
      expect(moved.shapes.get(elementId("a"))?.position).toEqual({ x: 3, y: 4 });
    });
  });

  describe("edges", () => {
    const edge: Link = {
      id: linkId("e1"),
      layerId: DEFAULT_LAYER_ID,
      from: { kind: "point", position: { x: 0, y: 0 } },
      to: { kind: "point", position: { x: 10, y: 0 } },
      order: orderBetween(null, null),
      style: {},
    };

    it("add and remove are inverses", () => {
      const { scene, patch } = addLink(emptyScene(), edge);
      expect(scene.edges.size).toBe(1);
      const back = apply(scene, invert(patch));
      expect(back.edges.size).toBe(0);

      const { scene: removed, patch: rp } = removeLink(scene, edge.id);
      expect(removed.edges.size).toBe(0);
      expect(apply(removed, invert(rp)).edges.size).toBe(1);
    });
  });

  describe("layers", () => {
    const layer: Layer = {
      id: layerId("L2"),
      name: "Second",
      visible: true,
      locked: false,
      order: orderBetween(null, null),
    };

    it("add / update / remove", () => {
      const { scene: s1 } = addLayer(emptyScene(), layer);
      expect(s1.layers.size).toBe(2);
      const { scene: s2 } = updateLayer(s1, layer.id, (l) => ({ ...l, visible: false }));
      expect(s2.layers.get(layer.id)?.visible).toBe(false);
      const { scene: s3 } = removeLayer(s2, layer.id);
      expect(s3.layers.size).toBe(1);
    });
  });

  describe("viewport", () => {
    it("setViewport is invertible", () => {
      const next: Viewport = {
        pan: { x: 10, y: 20 },
        zoom: 2,
        rotation: 0,
        size: { width: 800, height: 600 },
      };
      const { scene, patch } = setViewport(emptyScene(), next);
      expect(scene.viewport).toEqual(next);
      const back = apply(scene, invert(patch));
      expect(back.viewport.pan).toEqual({ x: 0, y: 0 });
    });
  });
});
