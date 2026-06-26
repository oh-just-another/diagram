import { describe, expect, it } from "vitest";
import { annotationId, linkId, layerId, elementId } from "@oh-just-another/types";
import {
  addAnnotation,
  addLink,
  addLayer,
  addElement,
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  invert,
  orderBetween,
  removeAnnotation,
  removeLink,
  removeLayer,
  updateAnnotation,
  updateElement,
  updateLink,
  updateLayer,
  type Annotation,
  type Link,
  type Layer,
} from "../src/index";

const edge = (id: string): Link => ({
  id: linkId(id),
  layerId: DEFAULT_LAYER_ID,
  from: { kind: "point", position: { x: 0, y: 0 } },
  to: { kind: "point", position: { x: 10, y: 0 } },
  order: orderBetween(null, null),
  style: {},
});

const layer = (id: string): Layer => ({
  id: layerId(id),
  name: "Layer",
  visible: true,
  locked: false,
  order: orderBetween(null, null),
});

const annotation = (id: string): Annotation => ({
  id: annotationId(id),
  elementId: null,
  position: { x: 1, y: 2 },
  resolved: false,
  thread: [],
  createdAt: "2024-01-01T00:00:00.000Z",
});

describe("operations — missing-id / duplicate guards", () => {
  describe("elements", () => {
    it("updateElement throws on a missing id", () => {
      expect(() => updateElement(emptyScene(), elementId("missing"), (s) => s)).toThrow(
        /not found/i,
      );
    });
  });

  describe("links", () => {
    it("addLink throws on a duplicate id", () => {
      const { scene } = addLink(emptyScene(), edge("e1"));
      expect(() => addLink(scene, edge("e1"))).toThrow(/already exists/i);
    });

    it("removeLink throws on a missing id", () => {
      expect(() => removeLink(emptyScene(), linkId("missing"))).toThrow(/not found/i);
    });

    it("updateLink applies the update and is invertible", () => {
      const { scene } = addLink(emptyScene(), edge("e1"));
      const { scene: updated, patch } = updateLink(scene, linkId("e1"), (l) => ({
        ...l,
        to: { kind: "point", position: { x: 99, y: 0 } },
      }));
      expect(updated.links.get(linkId("e1"))?.to).toEqual({
        kind: "point",
        position: { x: 99, y: 0 },
      });
      const back = apply(updated, invert(patch));
      expect(back.links.get(linkId("e1"))?.to).toEqual({
        kind: "point",
        position: { x: 10, y: 0 },
      });
    });

    it("updateLink throws on a missing id", () => {
      expect(() => updateLink(emptyScene(), linkId("missing"), (l) => l)).toThrow(/not found/i);
    });
  });

  describe("layers", () => {
    it("addLayer throws on a duplicate id", () => {
      const { scene } = addLayer(emptyScene(), layer("L2"));
      expect(() => addLayer(scene, layer("L2"))).toThrow(/already exists/i);
    });

    it("removeLayer throws on a missing id", () => {
      expect(() => removeLayer(emptyScene(), layerId("missing"))).toThrow(/not found/i);
    });

    it("updateLayer throws on a missing id", () => {
      expect(() => updateLayer(emptyScene(), layerId("missing"), (l) => l)).toThrow(/not found/i);
    });
  });

  describe("annotations", () => {
    it("addAnnotation adds and is invertible", () => {
      const { scene, patch } = addAnnotation(emptyScene(), annotation("a1"));
      expect(scene.annotations.size).toBe(1);
      expect(apply(scene, invert(patch)).annotations.size).toBe(0);
    });

    it("addAnnotation throws on a duplicate id", () => {
      const { scene } = addAnnotation(emptyScene(), annotation("a1"));
      expect(() => addAnnotation(scene, annotation("a1"))).toThrow(/already exists/i);
    });

    it("removeAnnotation removes an existing annotation", () => {
      const { scene } = addAnnotation(emptyScene(), annotation("a1"));
      const { scene: removed, patch } = removeAnnotation(scene, annotationId("a1"));
      expect(removed.annotations.has(annotationId("a1"))).toBe(false);
      expect(apply(removed, invert(patch)).annotations.has(annotationId("a1"))).toBe(true);
    });

    it("removeAnnotation throws on a missing id", () => {
      expect(() => removeAnnotation(emptyScene(), annotationId("missing"))).toThrow(/not found/i);
    });

    it("updateAnnotation applies the update and is invertible", () => {
      const { scene } = addAnnotation(emptyScene(), annotation("a1"));
      const { scene: updated, patch } = updateAnnotation(scene, annotationId("a1"), (a) => ({
        ...a,
        resolved: true,
      }));
      expect(updated.annotations.get(annotationId("a1"))?.resolved).toBe(true);
      const back = apply(updated, invert(patch));
      expect(back.annotations.get(annotationId("a1"))?.resolved).toBe(false);
    });

    it("updateAnnotation throws on a missing id", () => {
      expect(() => updateAnnotation(emptyScene(), annotationId("missing"), (a) => a)).toThrow(
        /not found/i,
      );
    });
  });

  describe("addElement guard (re-pin)", () => {
    it("throws when the id already exists in the scene", () => {
      const r = {
        id: elementId("a"),
        layerId: DEFAULT_LAYER_ID,
        type: "rectangle" as const,
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        order: orderBetween(null, null),
        style: {},
        width: 10,
        height: 10,
      };
      const { scene } = addElement(emptyScene(), r);
      expect(() => addElement(scene, r)).toThrow(/already exists/i);
    });
  });
});
