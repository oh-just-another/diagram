import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Patch,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import {
  topGroupAncestor,
  isDescendantOfGroup,
  promoteToGroupRoot,
  computeDimElements,
  pickDrillTarget,
} from "../src/group-helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rect = (id: string, parentId?: ReturnType<typeof elementId>): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#aaa" },
  width: 20,
  height: 20,
  ...(parentId !== undefined ? { parentId } : {}),
});

const group = (id: string, parentId?: ReturnType<typeof elementId>): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "group",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  ...(parentId !== undefined ? { parentId } : {}),
});

const sceneWith = (...elements: Element[]): Scene => {
  let s = emptyScene();
  for (const shape of elements) {
    s = apply(s, { kind: "element", id: shape.id, before: null, after: shape } satisfies Patch);
  }
  return s;
};

// ---------------------------------------------------------------------------
// topGroupAncestor
// ---------------------------------------------------------------------------

describe("topGroupAncestor", () => {
  it("returns null for a top-level shape with no parent", () => {
    const r = rect("r1");
    expect(topGroupAncestor(sceneWith(r), r)).toBeNull();
  });

  it("returns the single group ancestor when one level deep", () => {
    const g = group("g1");
    const r = rect("r1", g.id);
    const scene = sceneWith(g, r);
    expect(topGroupAncestor(scene, r)).toStrictEqual(scene.elements.get(g.id));
  });

  it("returns the outermost group for deeply nested shapes", () => {
    // g1 → g2 → r1
    const g1 = group("g1");
    const g2 = group("g2", g1.id);
    const r = rect("r1", g2.id);
    const scene = sceneWith(g1, g2, r);
    expect(topGroupAncestor(scene, r)).toStrictEqual(scene.elements.get(g1.id));
  });

  it("returns null when parent is not a group (e.g., container)", () => {
    // Parent is a rectangle (container) — not a group, so no group ancestor.
    const container = rect("c1");
    const child = rect("r1", container.id);
    const scene = sceneWith(container, child);
    expect(topGroupAncestor(scene, child)).toBeNull();
  });

  it("stops gracefully when a parentId points to a missing element", () => {
    const ghost: Element = { ...rect("orphan"), parentId: elementId("missing") };
    const scene = sceneWith(ghost);
    expect(topGroupAncestor(scene, ghost)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isDescendantOfGroup
// ---------------------------------------------------------------------------

describe("isDescendantOfGroup", () => {
  it("returns true when elementId === groupId (identity)", () => {
    const g = group("g1");
    const scene = sceneWith(g);
    expect(isDescendantOfGroup(scene, g.id, g.id)).toBe(true);
  });

  it("returns true for a direct child", () => {
    const g = group("g1");
    const r = rect("r1", g.id);
    const scene = sceneWith(g, r);
    expect(isDescendantOfGroup(scene, r.id, g.id)).toBe(true);
  });

  it("returns true for a grandchild", () => {
    const g1 = group("g1");
    const g2 = group("g2", g1.id);
    const r = rect("r1", g2.id);
    const scene = sceneWith(g1, g2, r);
    expect(isDescendantOfGroup(scene, r.id, g1.id)).toBe(true);
  });

  it("returns false for an unrelated element", () => {
    const g = group("g1");
    const r = rect("r2");
    const scene = sceneWith(g, r);
    expect(isDescendantOfGroup(scene, r.id, g.id)).toBe(false);
  });

  it("returns false when element does not exist in scene", () => {
    const g = group("g1");
    const scene = sceneWith(g);
    expect(isDescendantOfGroup(scene, elementId("ghost"), g.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// promoteToGroupRoot
// ---------------------------------------------------------------------------

describe("promoteToGroupRoot", () => {
  it("returns the shape itself when it has no parent", () => {
    const r = rect("r1");
    const scene = sceneWith(r);
    expect(promoteToGroupRoot(scene, r, null)).toStrictEqual(r);
  });

  it("returns the shape itself when its parent is not a group", () => {
    const container = rect("c1");
    const child = rect("r1", container.id);
    const scene = sceneWith(container, child);
    expect(promoteToGroupRoot(scene, child, null)).toStrictEqual(child);
  });

  it("promotes to the top-level group when not entered", () => {
    const g = group("g1");
    const r = rect("r1", g.id);
    const scene = sceneWith(g, r);
    expect(promoteToGroupRoot(scene, r, null)?.id).toBe(g.id);
  });

  it("stops at the entered group boundary", () => {
    // g1 → g2 → r; entered = g1 → should promote only to g2.
    const g1 = group("g1");
    const g2 = group("g2", g1.id);
    const r = rect("r1", g2.id);
    const scene = sceneWith(g1, g2, r);
    expect(promoteToGroupRoot(scene, r, g1.id)?.id).toBe(g2.id);
  });

  it("stops at the entered group when shape is a direct child of entered group", () => {
    const g = group("g1");
    const r = rect("r1", g.id);
    const scene = sceneWith(g, r);
    // enteredGroup === r.parentId → break immediately, return r itself
    expect(promoteToGroupRoot(scene, r, g.id)?.id).toBe(r.id);
  });
});

// ---------------------------------------------------------------------------
// computeDimElements
// ---------------------------------------------------------------------------

describe("computeDimElements", () => {
  it("dims elements not in the entered group's subtree", () => {
    const g = group("g1");
    const child = rect("r1", g.id);
    const outside = rect("r2");
    const scene = sceneWith(g, child, outside);
    const dim = computeDimElements(scene, [], g.id);
    // outside is not a descendant → dimmed
    expect(dim.has(outside.id)).toBe(true);
  });

  it("does not dim descendants of the entered group", () => {
    const g = group("g1");
    const child = rect("r1", g.id);
    const scene = sceneWith(g, child);
    const dim = computeDimElements(scene, [], g.id);
    expect(dim.has(child.id)).toBe(false);
  });

  it("does not dim the group itself (it is a descendant of itself via identity check)", () => {
    const g = group("g1");
    const scene = sceneWith(g);
    const dim = computeDimElements(scene, [], g.id);
    expect(dim.has(g.id)).toBe(false);
  });

  it("does not dim elements that are in the selection (opaque guard)", () => {
    const g = group("g1");
    const outside = rect("r2");
    const scene = sceneWith(g, outside);
    // outside is not a descendant, BUT it is in the selection → stays opaque
    const dim = computeDimElements(scene, [outside.id], g.id);
    expect(dim.has(outside.id)).toBe(false);
  });

  it("returns an empty set when all elements are descendants", () => {
    const g = group("g1");
    const a = rect("a", g.id);
    const b = rect("b", g.id);
    const scene = sceneWith(g, a, b);
    const dim = computeDimElements(scene, [], g.id);
    // g itself is identity-descendant; a and b are direct children
    expect(dim.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// pickDrillTarget
// ---------------------------------------------------------------------------

describe("pickDrillTarget", () => {
  it("returns null when top is null (no group ancestor)", () => {
    const r = rect("r1");
    const scene = sceneWith(r);
    expect(pickDrillTarget(scene, r, null, null)).toBeNull();
  });

  it("returns the top group when not yet entered (first double-click)", () => {
    const g = group("g1");
    const r = rect("r1", g.id);
    const scene = sceneWith(g, r);
    const topEl = scene.elements.get(g.id)!;
    expect(pickDrillTarget(scene, r, topEl, null)?.id).toBe(g.id);
  });

  it("returns the top group when entered a different group (top not yet entered)", () => {
    const g1 = group("g1");
    const g2 = group("g2");
    const r = rect("r1", g1.id);
    const scene = sceneWith(g1, g2, r);
    const topEl = scene.elements.get(g1.id)!;
    // enteredGroup is g2, not g1 → return g1
    expect(pickDrillTarget(scene, r, topEl, g2.id)?.id).toBe(g1.id);
  });

  it("returns the inner group when the top is already entered (drill deeper)", () => {
    // g1 → g2 → r; top = g1, already entered g1 → should drill into g2.
    const g1 = group("g1");
    const g2 = group("g2", g1.id);
    const r = rect("r1", g2.id);
    const scene = sceneWith(g1, g2, r);
    const topEl = scene.elements.get(g1.id)!;
    const result = pickDrillTarget(scene, r, topEl, g1.id);
    expect(result?.id).toBe(g2.id);
  });

  it("returns null when top is already entered but there's no inner group between shape and top", () => {
    // g1 → r (direct child, no intermediate group); top=g1, entered=g1 → nothing to drill into.
    const g1 = group("g1");
    const r = rect("r1", g1.id);
    const scene = sceneWith(g1, r);
    const topEl = scene.elements.get(g1.id)!;
    const result = pickDrillTarget(scene, r, topEl, g1.id);
    expect(result).toBeNull();
  });
});
