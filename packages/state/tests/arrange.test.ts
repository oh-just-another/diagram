import { describe, expect, it } from "vitest";
import { elementId, type ElementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  apply,
  emptyScene,
  orderBetween,
  type Element,
  type Patch,
  type Scene,
} from "@oh-just-another/scene";
import { computeAlignPatches, computeFlipPatches } from "../src/editor/applies/arrange";

const rect = (id: string, x: number, y = 0): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 40,
  height: 40,
});

const sceneWith = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const el of elements) s = addElement(s, el).scene;
  return s;
};

/** Narrow each flip patch (always an element patch) to `id → after`. */
const afters = (patches: readonly Patch[]): Map<ElementId, Element> => {
  const out = new Map<ElementId, Element>();
  for (const p of patches) {
    if (p.kind !== "element" || p.after === null) throw new Error("expected an element patch");
    out.set(p.id, p.after);
  }
  return out;
};

describe("computeFlipPatches", () => {
  it("mirrors a single element about its own centre and flips scale.x", () => {
    const scene = sceneWith(rect("a", 0)); // bounds 0..40, centre x = 20
    const a = afters(computeFlipPatches(scene, [elementId("a")], "horizontal")).get(
      elementId("a"),
    )!;
    expect(a.position.x).toBeCloseTo(40); // 2·20 − 0
    expect(a.position.y).toBeCloseTo(0);
    expect(a.scale).toEqual({ x: -1, y: 1 });
  });

  it("swaps two elements across the selection centre on horizontal flip", () => {
    const scene = sceneWith(rect("a", 0), rect("b", 100)); // union 0..140, centre 70
    const m = afters(computeFlipPatches(scene, [elementId("a"), elementId("b")], "horizontal"));
    expect(m.get(elementId("a"))!.position.x).toBeCloseTo(140); // 2·70 − 0
    expect(m.get(elementId("b"))!.position.x).toBeCloseTo(40); // 2·70 − 100
  });

  it("flips on the vertical axis", () => {
    const scene = sceneWith(rect("a", 0, 0), rect("b", 0, 100)); // union y 0..140, centre 70
    const m = afters(computeFlipPatches(scene, [elementId("a"), elementId("b")], "vertical"));
    expect(m.get(elementId("a"))!.position.y).toBeCloseTo(140);
    expect(m.get(elementId("b"))!.position.y).toBeCloseTo(40);
    expect(m.get(elementId("a"))!.scale).toEqual({ x: 1, y: -1 });
  });

  it("is its own inverse — flipping twice restores the original", () => {
    let scene = sceneWith(rect("a", 0), rect("b", 100));
    const ids = [elementId("a"), elementId("b")];
    for (const p of computeFlipPatches(scene, ids, "horizontal")) scene = apply(scene, p);
    const m = afters(computeFlipPatches(scene, ids, "horizontal"));
    expect(m.get(elementId("a"))!.position.x).toBeCloseTo(0);
    expect(m.get(elementId("b"))!.position.x).toBeCloseTo(100);
    expect(m.get(elementId("a"))!.scale).toEqual({ x: 1, y: 1 });
  });

  it("returns no patches for an empty selection", () => {
    expect(computeFlipPatches(sceneWith(rect("a", 0)), [], "horizontal")).toEqual([]);
  });
});

describe("computeAlignPatches", () => {
  const ids = [elementId("a"), elementId("b")];
  // a: 0..40, b: 100..140 → box x 0..140
  const scene = sceneWith(rect("a", 0), rect("b", 100));

  it("aligns left edges to the box's left", () => {
    const m = afters(computeAlignPatches(scene, ids, "left"));
    expect(m.get(elementId("b"))!.position.x).toBeCloseTo(0); // a was already at 0 → no patch
    expect(m.has(elementId("a"))).toBe(false);
  });

  it("aligns right edges to the box's right", () => {
    const m = afters(computeAlignPatches(scene, ids, "right"));
    expect(m.get(elementId("a"))!.position.x).toBeCloseTo(100); // right edge 40 → 140
  });

  it("aligns horizontal centres", () => {
    const m = afters(computeAlignPatches(scene, ids, "h-center")); // box centre x = 70
    expect(m.get(elementId("a"))!.position.x).toBeCloseTo(50); // centre 20 → 70
    expect(m.get(elementId("b"))!.position.x).toBeCloseTo(50); // centre 120 → 70
  });

  it("aligns on the vertical axis", () => {
    const v = sceneWith(rect("a", 0, 0), rect("b", 0, 100)); // box y 0..140
    const m = afters(computeAlignPatches(v, ids, "bottom"));
    expect(m.get(elementId("a"))!.position.y).toBeCloseTo(100); // bottom 40 → 140
  });

  it("needs at least two elements", () => {
    expect(computeAlignPatches(scene, [elementId("a")], "left")).toEqual([]);
  });
});
