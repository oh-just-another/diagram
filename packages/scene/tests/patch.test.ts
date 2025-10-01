import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  apply,
  batch,
  DEFAULT_LAYER_ID,
  emptyScene,
  invert,
  isNoop,
  orderBetween,
  type Patch,
  type Element,
} from "../src/index";

const shape: Element = {
  id: elementId("s1"),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 10,
  height: 10,
};

describe("patch", () => {
  describe("apply", () => {
    it("add: before=null, after=shape", () => {
      const scene = apply(emptyScene(), {
        kind: "element",
        id: shape.id,
        before: null,
        after: shape,
      });
      expect(scene.shapes.get(shape.id)).toBe(shape);
    });
    it("remove: before=shape, after=null", () => {
      const s1 = apply(emptyScene(), { kind: "element", id: shape.id, before: null, after: shape });
      const s2 = apply(s1, { kind: "element", id: shape.id, before: shape, after: null });
      expect(s2.shapes.has(shape.id)).toBe(false);
    });
    it("update: before=A, after=B", () => {
      const next = { ...shape, position: { x: 5, y: 5 } };
      const s1 = apply(emptyScene(), { kind: "element", id: shape.id, before: null, after: shape });
      const s2 = apply(s1, { kind: "element", id: shape.id, before: shape, after: next });
      expect(s2.shapes.get(shape.id)?.position).toEqual({ x: 5, y: 5 });
    });
  });

  describe("invert", () => {
    it("inverts an add into a remove", () => {
      const p: Patch = { kind: "element", id: shape.id, before: null, after: shape };
      const i = invert(p);
      expect(i).toEqual({ kind: "element", id: shape.id, before: shape, after: null });
    });
    it("applying patch then its inverse returns the original scene", () => {
      const start = emptyScene();
      const p: Patch = { kind: "element", id: shape.id, before: null, after: shape };
      const mid = apply(start, p);
      const end = apply(mid, invert(p));
      expect(end.shapes.size).toBe(0);
    });
    it("batch inverse is the reversed inverses", () => {
      const p1: Patch = { kind: "element", id: shape.id, before: null, after: shape };
      const p2: Patch = {
        kind: "element",
        id: shape.id,
        before: shape,
        after: { ...shape, position: { x: 1, y: 1 } },
      };
      const b = batch([p1, p2]);
      const ib = invert(b);
      expect(ib.kind).toBe("batch");
      if (ib.kind === "batch") {
        expect(ib.patches).toHaveLength(2);
        // Order should be reversed: invert(p2) first, then invert(p1)
        expect(ib.patches[0]).toEqual(invert(p2));
        expect(ib.patches[1]).toEqual(invert(p1));
      }
    });
  });

  describe("batch", () => {
    it("flattens nested batches", () => {
      const p1: Patch = { kind: "element", id: shape.id, before: null, after: shape };
      const inner = batch([p1, p1]);
      const outer = batch([p1, inner]);
      if (outer.kind === "batch") {
        expect(outer.patches).toHaveLength(3);
        expect(outer.patches.every((p) => p.kind === "element")).toBe(true);
      }
    });
    it("apply runs patches in order", () => {
      const s2 = { ...shape, id: elementId("s2") };
      const p1: Patch = { kind: "element", id: shape.id, before: null, after: shape };
      const p2: Patch = { kind: "element", id: s2.id, before: null, after: s2 };
      const final = apply(emptyScene(), batch([p1, p2]));
      expect(final.shapes.size).toBe(2);
    });
  });

  describe("isNoop", () => {
    it("identical before/after is a no-op", () => {
      expect(isNoop({ kind: "element", id: shape.id, before: shape, after: shape })).toBe(true);
    });
    it("real changes are not no-ops", () => {
      expect(isNoop({ kind: "element", id: shape.id, before: null, after: shape })).toBe(false);
    });
    it("empty batch is a no-op", () => {
      expect(isNoop(batch([]))).toBe(true);
    });
  });
});
