import { describe, expect, it } from "vitest";
import { linkId, layerId, elementId } from "@oh-just-another/types";
import {
  addLink,
  addLayer,
  addElement,
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  invert,
  moveElement,
  orderBetween,
  removeLink,
  removeLayer,
  removeElement,
  setViewport,
  updateLayer,
  updateElement,
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
  describe("addElement", () => {
    it("adds and returns inverse-able patch", () => {
      const { scene, patch } = addElement(emptyScene(), rect("a"));
      expect(scene.elements.size).toBe(1);
      const back = apply(scene, invert(patch));
      expect(back.elements.size).toBe(0);
    });
    it("throws on duplicate id", () => {
      const { scene } = addElement(emptyScene(), rect("a"));
      expect(() => addElement(scene, rect("a"))).toThrow(/already exists/i);
    });
  });

  describe("removeElement", () => {
    it("removes existing shape", () => {
      const { scene } = addElement(emptyScene(), rect("a"));
      const { scene: removed, patch } = removeElement(scene, elementId("a"));
      expect(removed.elements.has(elementId("a"))).toBe(false);
      const restored = apply(removed, invert(patch));
      expect(restored.elements.has(elementId("a"))).toBe(true);
    });
    it("throws on missing id", () => {
      expect(() => removeElement(emptyScene(), elementId("missing"))).toThrow(/not found/i);
    });
  });

  describe("updateElement", () => {
    it("applies the update function and produces invertible patch", () => {
      const { scene } = addElement(emptyScene(), rect("a"));
      const { scene: moved, patch } = updateElement(scene, elementId("a"), (s) => ({
        ...s,
        position: { x: 5, y: 7 },
      }));
      expect(moved.elements.get(elementId("a"))?.position).toEqual({ x: 5, y: 7 });
      const back = apply(moved, invert(patch));
      expect(back.elements.get(elementId("a"))?.position).toEqual({ x: 0, y: 0 });
    });
  });

  describe("moveElement", () => {
    it("shortcut for updating position", () => {
      const { scene } = addElement(emptyScene(), rect("a"));
      const { scene: moved } = moveElement(scene, elementId("a"), { x: 3, y: 4 });
      expect(moved.elements.get(elementId("a"))?.position).toEqual({ x: 3, y: 4 });
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
      expect(scene.links.size).toBe(1);
      const back = apply(scene, invert(patch));
      expect(back.links.size).toBe(0);

      const { scene: removed, patch: rp } = removeLink(scene, edge.id);
      expect(removed.links.size).toBe(0);
      expect(apply(removed, invert(rp)).links.size).toBe(1);
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
        gridEnabled: false,
      };
      const { scene, patch } = setViewport(emptyScene(), next);
      expect(scene.viewport).toEqual(next);
      const back = apply(scene, invert(patch));
      expect(back.viewport.pan).toEqual({ x: 0, y: 0 });
    });
  });
});
