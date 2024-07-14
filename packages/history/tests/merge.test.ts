import { describe, expect, it } from "vitest";
import { shapeId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  DEFAULT_VIEWPORT,
  orderBetween,
  type Patch,
  type Shape,
  type Viewport,
} from "@oh-just-another/scene";
import { mergeByEntity } from "../src/index";

const rect = (id: string, x = 0): Shape => ({
  id: shapeId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 10,
  height: 10,
});

describe("mergeByEntity", () => {
  it("collapses consecutive shape patches to first.before / last.after", () => {
    const a0 = rect("a", 0);
    const a1 = rect("a", 5);
    const a2 = rect("a", 12);
    const out = mergeByEntity([
      { kind: "shape", id: a0.id, before: a0, after: a1 },
      { kind: "shape", id: a0.id, before: a1, after: a2 },
    ]);
    expect(out).toEqual([{ kind: "shape", id: a0.id, before: a0, after: a2 }]);
  });

  it("keeps separate entries for different shape ids", () => {
    const a = rect("a");
    const b = rect("b");
    const out = mergeByEntity([
      { kind: "shape", id: a.id, before: null, after: a },
      { kind: "shape", id: b.id, before: null, after: b },
    ]);
    expect(out).toHaveLength(2);
  });

  it("preserves first-appearance order", () => {
    const a = rect("a");
    const b = rect("b");
    const out = mergeByEntity([
      { kind: "shape", id: b.id, before: null, after: b },
      { kind: "shape", id: a.id, before: null, after: a },
      { kind: "shape", id: b.id, before: b, after: rect("b", 9) },
    ]);
    expect(out.map((p) => (p.kind === "shape" ? p.id : "?"))).toEqual([b.id, a.id]);
  });

  it("flattens nested batches", () => {
    const a = rect("a", 0);
    const a1 = rect("a", 7);
    const patches: Patch[] = [
      { kind: "batch", patches: [{ kind: "shape", id: a.id, before: a, after: a1 }] },
    ];
    const out = mergeByEntity(patches);
    expect(out).toEqual([{ kind: "shape", id: a.id, before: a, after: a1 }]);
  });

  it("merges multiple viewport patches into one", () => {
    const v0 = DEFAULT_VIEWPORT;
    const v1: Viewport = { ...v0, pan: { x: 10, y: 0 } };
    const v2: Viewport = { ...v0, pan: { x: 25, y: 0 } };
    const out = mergeByEntity([
      { kind: "viewport", before: v0, after: v1 },
      { kind: "viewport", before: v1, after: v2 },
    ]);
    expect(out).toEqual([{ kind: "viewport", before: v0, after: v2 }]);
  });

  it("drops patches that collapse to a no-op", () => {
    const a = rect("a");
    const out = mergeByEntity([
      { kind: "shape", id: a.id, before: a, after: rect("a", 5) },
      { kind: "shape", id: a.id, before: rect("a", 5), after: a },
    ]);
    expect(out).toEqual([]);
  });
});
