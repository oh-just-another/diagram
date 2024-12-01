import { describe, expect, it } from "vitest";
import { shapeId } from "@oh-just-another/types";
import {
  addShape,
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Shape,
} from "../src/index.js";
import { treeLayout } from "../src/layout.js";

const rect = (id: string, parentId: string | null, w = 40, h = 30): Shape => ({
  id: shapeId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: w,
  height: h,
  ...(parentId ? { parentId: shapeId(parentId) } : {}),
});

const sceneWith = (...shapes: Shape[]): Scene => {
  let s = emptyScene();
  for (const shape of shapes) {
    const r = addShape(s, shape);
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
    expect(next.shapes.get(root.id)!.position).toEqual({ x: 25, y: 0 });
    expect(next.shapes.get(c1.id)!.position).toEqual({ x: 0, y: 50 });
    expect(next.shapes.get(c2.id)!.position).toEqual({ x: 50, y: 50 });
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
    expect(next.shapes.get(a1.id)!.position.x).toBe(0);
    expect(next.shapes.get(a1.id)!.position.y).toBe(100); // root (30h) + ranksep + a (30h) + ranksep = 30+20+30+20 = 100
  });
});
