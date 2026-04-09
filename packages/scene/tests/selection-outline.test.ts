import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  getElementOutline,
  registerElementOutline,
  orderBetween,
  type Element,
  type Scene,
} from "../src/index";

const base = (id: string, over: Partial<Element>): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    ...over,
  }) as Element;

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) s = addElement(s, e).scene;
  return s;
};

describe("getElementOutline", () => {
  it("traces a polygon exactly (points → world), one loop", () => {
    const poly = base("p", {
      type: "polygon",
      position: { x: 100, y: 0 },
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ],
    });
    const loops = getElementOutline(sceneWith(poly), poly);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toEqual([
      { x: 100, y: 0 },
      { x: 110, y: 0 },
      { x: 105, y: 10 },
    ]);
  });

  it("samples an ellipse into one closed loop of fixed density", () => {
    const ell = base("e", { type: "ellipse", width: 100, height: 50 });
    const loops = getElementOutline(sceneWith(ell), ell);
    expect(loops).toHaveLength(1);
    expect(loops[0]!.length).toBe(48);
    // First sample is the top of the ellipse (12 o'clock): (cx, 0).
    expect(loops[0]![0]).toEqual({ x: 50, y: 0 });
  });

  it("returns a 4-point loop for a rectangle", () => {
    const r = base("r", { type: "rectangle", width: 40, height: 20, position: { x: 5, y: 5 } });
    const loops = getElementOutline(sceneWith(r), r);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toEqual([
      { x: 5, y: 5 },
      { x: 45, y: 5 },
      { x: 45, y: 25 },
      { x: 5, y: 25 },
    ]);
  });

  it("returns one loop per child for a group (handles disconnected figures)", () => {
    const group = base("g", { type: "group" });
    const c1 = base("c1", { type: "rectangle", width: 10, height: 10, parentId: elementId("g") });
    const c2 = base("c2", {
      type: "rectangle",
      width: 10,
      height: 10,
      position: { x: 100, y: 0 },
      parentId: elementId("g"),
    });
    const scene = sceneWith(group, c1, c2);
    const loops = getElementOutline(scene, group);
    expect(loops).toHaveLength(2);
  });

  it("uses a registered multi-loop outline provider for a custom type", () => {
    registerElementOutline("test.dual", (shape) => {
      const s = shape as Element & { width: number };
      return [
        [
          { x: 0, y: 0 },
          { x: s.width / 2, y: 0 },
          { x: s.width / 2, y: 10 },
        ],
        [
          { x: s.width / 2, y: 0 },
          { x: s.width, y: 0 },
          { x: s.width, y: 10 },
        ],
      ];
    });
    const custom = base("d", { type: "test.dual", position: { x: 5, y: 5 } } as Partial<Element>) as Element & {
      width: number;
    };
    (custom as { width: number }).width = 40;
    const loops = getElementOutline(emptyScene(), custom);
    expect(loops).toHaveLength(2);
    // first loop's first point transformed by position (5,5)
    expect(loops[0]![0]).toEqual({ x: 5, y: 5 });
    expect(loops[1]![0]).toEqual({ x: 25, y: 5 });
  });

  it("applies scale and rotation to the traced contour", () => {
    // 90° rotation of a unit square at origin, scale 2 → corners rotate.
    const r = base("r", {
      type: "rectangle",
      width: 10,
      height: 10,
      scale: { x: 2, y: 2 },
      rotation: Math.PI / 2,
    });
    const loops = getElementOutline(sceneWith(r), r);
    // (0,0)→(0,0); (10,0)*2 rotated 90° → (0,20).
    expect(loops[0]![0]!.x).toBeCloseTo(0, 5);
    expect(loops[0]![0]!.y).toBeCloseTo(0, 5);
    expect(loops[0]![1]!.x).toBeCloseTo(0, 5);
    expect(loops[0]![1]!.y).toBeCloseTo(20, 5);
  });
});
