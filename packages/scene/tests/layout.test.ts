import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "../src/index.js";
import {
  gridLayout,
  measureWrap,
  runAutoLayout,
  stackLayout,
  treeLayout,
  wrapLayout,
} from "../src/layout.js";

const rect = (id: string, parentId: string | null, w = 40, h = 30): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: w,
  height: h,
  ...(parentId ? { parentId: elementId(parentId) } : {}),
});

const sceneWith = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const shape of elements) {
    const r = addElement(s, shape);
    s = r.scene;
  }
  return s;
};

describe("treeLayout", () => {
  it("positions a single root with no children at origin", () => {
    const root = rect("root", null);
    const scene = sceneWith(root);
    const patch = treeLayout(scene, { shapeIds: [root.id], origin: { x: 0, y: 0 } });
    // No children, no descendants → root is at origin already → null patch.
    expect(patch).toBeNull();
  });

  it("stacks two children below the parent, each centred under its subtree", () => {
    // root w=40, two leaves w=40 each, nodesep=10, ranksep=20.
    // subtree width = 40 + 10 + 40 = 90. root centred at x = (90 - 40)/2 = 25.
    // child 1 at x=0, child 2 at x=50 (40 + 10).
    const root = rect("root", null);
    const c1 = rect("c1", "root");
    const c2 = rect("c2", "root");
    const scene = sceneWith(root, c1, c2);
    const patch = treeLayout(scene, {
      shapeIds: [root.id],
      origin: { x: 0, y: 0 },
      ranksep: 20,
      nodesep: 10,
    });
    expect(patch).not.toBeNull();
    const next = apply(scene, patch!);
    expect(next.elements.get(root.id)!.position).toEqual({ x: 25, y: 0 });
    expect(next.elements.get(c1.id)!.position).toEqual({ x: 0, y: 50 });
    expect(next.elements.get(c2.id)!.position).toEqual({ x: 50, y: 50 });
  });

  it("recursively lays out deeper subtrees", () => {
    // root → a, b. a → a1.
    // subtree-a width = 40 (only one child of width 40).
    // subtree-b width = 40.
    // root subtree width = 40 + 10 + 40 = 90.
    // root centred at 25; a at x=0; b at x=50.
    // a's child a1 directly under a: subtree-a width 40, a1 at same x as a (centred).
    const root = rect("root", null);
    const a = rect("a", "root");
    const b = rect("b", "root");
    const a1 = rect("a1", "a");
    const scene = sceneWith(root, a, b, a1);
    const patch = treeLayout(scene, {
      shapeIds: [root.id],
      origin: { x: 0, y: 0 },
      ranksep: 20,
      nodesep: 10,
    });
    expect(patch).not.toBeNull();
    const next = apply(scene, patch!);
    expect(next.elements.get(a1.id)!.position.x).toBe(0);
    expect(next.elements.get(a1.id)!.position.y).toBe(100); // root (30h) + ranksep + a (30h) + ranksep = 30+20+30+20 = 100
  });
});

describe("wrapLayout (flex-wrap flow)", () => {
  // Three 100×50 boxes, ordered a<b<c, gap 10.
  const ordered = (): { a: Element; b: Element; c: Element } => {
    const o0 = orderBetween(null, null);
    const o1 = orderBetween(o0, null);
    const o2 = orderBetween(o1, null);
    const mk = (id: string, order: typeof o0): Element => ({ ...rect(id, null, 100, 50), order });
    return { a: mk("a", o0), b: mk("b", o1), c: mk("c", o2) };
  };

  it("flows left→right, wraps to a new row when the next child overruns innerWidth", () => {
    const { a, b, c } = ordered();
    const scene = sceneWith(a, b, c);
    // innerWidth 250: a(100)+gap(10)+b(100)=210 fits; +c would be 320 > 250 → wrap.
    const patch = wrapLayout(scene, {
      shapeIds: [a.id, b.id, c.id],
      innerWidth: 250,
      gap: 10,
      origin: { x: 0, y: 0 },
    });
    const next = apply(scene, patch!);
    expect(next.elements.get(a.id)!.position).toEqual({ x: 0, y: 0 });
    expect(next.elements.get(b.id)!.position).toEqual({ x: 110, y: 0 });
    expect(next.elements.get(c.id)!.position).toEqual({ x: 0, y: 60 }); // row height 50 + gap 10
  });

  it("measureWrap reports widest child + wrapped content height", () => {
    const o0 = orderBetween(null, null);
    const o1 = orderBetween(o0, null);
    const o2 = orderBetween(o1, null);
    const parent: Element = {
      ...rect("p", null, 360, 100),
      metadata: { autoLayout: { kind: "wrap", gap: 10 } },
    };
    const a = { ...rect("a", "p", 100, 50), order: o0 };
    const b = { ...rect("b", "p", 100, 50), order: o1 };
    const c = { ...rect("c", "p", 100, 50), order: o2 };
    const scene = sceneWith(parent, a, b, c);
    // Wide: two per row → height 50 + 10 + 50 = 110, widest 100, contentWidth 210.
    expect(measureWrap(scene, parent.id, 250)).toEqual({
      widest: 100,
      contentWidth: 210,
      contentHeight: 110,
    });
    // Narrow (< widest): one per row → height 50*3 + 10*2 = 170.
    expect(measureWrap(scene, parent.id, 90)).toEqual({
      widest: 100,
      contentWidth: 100,
      contentHeight: 170,
    });
  });

  it("runAutoLayout dispatches a wrap container within its drop-zone", () => {
    const o0 = orderBetween(null, null);
    const o1 = orderBetween(o0, null);
    const parent: Element = {
      ...rect("p", null, 360, 100),
      position: { x: 0, y: 0 },
      metadata: {
        autoLayout: { kind: "wrap", gap: 10 },
        container: { dropZone: { x: 10, y: 10, width: 340, height: 80 }, padding: 10 },
      },
    };
    // 200-wide boxes: only one fits per 340-wide row → each on its own row.
    const a = { ...rect("a", "p", 200, 50), order: o0 };
    const b = { ...rect("b", "p", 200, 50), order: o1 };
    const scene = sceneWith(parent, a, b);
    const patch = runAutoLayout(scene, parent.id);
    const next = apply(scene, patch!);
    expect(next.elements.get(a.id)!.position).toEqual({ x: 10, y: 10 }); // drop-zone origin
    expect(next.elements.get(b.id)!.position).toEqual({ x: 10, y: 70 }); // wrapped below
  });
});

// Layout of non-rectangle shapes. `gridLayout` / `stackLayout` route the stride
// through the shape bounder registry rather than reading `shape.width` /
// `shape.height` directly, which are undefined on polygon / path / freedraw
// shapes.
describe("layout with polygon shapes", () => {
  const polygon = (
    id: string,
    parentId: string | null,
    points: { x: number; y: number }[],
  ): Element =>
    ({
      id: elementId(id),
      layerId: DEFAULT_LAYER_ID,
      type: "polygon",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      points,
      ...(parentId ? { parentId: elementId(parentId) } : {}),
    }) as Element;

  // Diamond AABB = 100×60.
  const diamondPoints = [
    { x: 50, y: 0 },
    { x: 100, y: 30 },
    { x: 50, y: 60 },
    { x: 0, y: 30 },
  ];
  // Triangle AABB = 80×80.
  const trianglePoints = [
    { x: 40, y: 0 },
    { x: 80, y: 80 },
    { x: 0, y: 80 },
  ];

  it("stackLayout horizontal advances by each polygon's AABB width, not 0", () => {
    const d = polygon("d", null, diamondPoints);
    const t = polygon("t", null, trianglePoints);
    const scene = sceneWith(d, t);
    const patch = stackLayout(scene, {
      shapeIds: [d.id, t.id],
      direction: "horizontal",
      gap: 10,
      origin: { x: 0, y: 0 },
    });
    expect(patch).not.toBeNull();
    const next = apply(scene, patch!);
    expect(next.elements.get(d.id)!.position).toEqual({ x: 0, y: 0 });
    // Diamond width (100) + gap (10) = 110.
    expect(next.elements.get(t.id)!.position).toEqual({ x: 110, y: 0 });
  });

  it("gridLayout cell size respects polygon AABB (no zero-stride overlap)", () => {
    const d1 = polygon("d1", null, diamondPoints);
    const d2 = polygon("d2", null, diamondPoints);
    const d3 = polygon("d3", null, diamondPoints);
    const scene = sceneWith(d1, d2, d3);
    const patch = gridLayout(scene, {
      shapeIds: [d1.id, d2.id, d3.id],
      cols: 2,
      gap: 10,
      origin: { x: 0, y: 0 },
    });
    expect(patch).not.toBeNull();
    const next = apply(scene, patch!);
    // Cell stride: width 100 + 10 = 110; height 60 + 10 = 70.
    expect(next.elements.get(d1.id)!.position).toEqual({ x: 0, y: 0 });
    expect(next.elements.get(d2.id)!.position).toEqual({ x: 110, y: 0 });
    expect(next.elements.get(d3.id)!.position).toEqual({ x: 0, y: 70 });
  });
});
