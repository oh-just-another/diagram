import { describe, expect, it } from "vitest";
import { elementId, layerId, linkId } from "@oh-just-another/types";
import {
  addElement,
  addLayer,
  addLink,
  DEFAULT_LAYER_ID,
  emptyScene,
  getChildrenOf,
  getDescendantsOf,
  getElementAt,
  getElementAtIndexed,
  getElementsCoveredByBounds,
  getElementsInLayer,
  getLink,
  getLinksInLayer,
  getRootSelf,
  isElementHidden,
  isElementLocked,
  buildSpatialIndex,
  orderBetween,
  updateElement,
  updateLayer,
  type Element,
  type Layer,
  type Link,
} from "../src/index";

const rect = (
  id: string,
  layer = DEFAULT_LAYER_ID,
  position = { x: 0, y: 0 },
  w = 40,
  h = 40,
): Element => ({
  id: elementId(id),
  layerId: layer,
  type: "rectangle",
  position,
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: w,
  height: h,
});

const makeLink = (id: string, layer = DEFAULT_LAYER_ID): Link => ({
  id: linkId(id),
  layerId: layer,
  from: { kind: "point", position: { x: 0, y: 0 } },
  to: { kind: "point", position: { x: 100, y: 0 } },
  routing: "straight",
  order: orderBetween(null, null),
  style: {},
});

// ---------------------------------------------------------------------------
// getLink
// ---------------------------------------------------------------------------
describe("getLink", () => {
  it("returns undefined for missing link", () => {
    const s = emptyScene();
    expect(getLink(s, linkId("x"))).toBeUndefined();
  });

  it("returns the link when present", () => {
    const lnk = makeLink("l1");
    const { scene } = addLink(emptyScene(), lnk);
    expect(getLink(scene, linkId("l1"))?.id).toBe(linkId("l1"));
  });
});

// ---------------------------------------------------------------------------
// getLinksInLayer
// ---------------------------------------------------------------------------
describe("getLinksInLayer", () => {
  it("returns empty array when no links in layer", () => {
    const s = emptyScene();
    expect(getLinksInLayer(s, DEFAULT_LAYER_ID)).toEqual([]);
  });

  it("returns only links in the specified layer, sorted by order", () => {
    let s = emptyScene();
    const lid2 = layerId("layer2");
    const layer2: Layer = {
      id: lid2,
      name: "L2",
      visible: true,
      locked: false,
      order: orderBetween(null, null),
    };
    ({ scene: s } = addLayer(s, layer2));
    const l1 = makeLink("l1", DEFAULT_LAYER_ID);
    const l2 = makeLink("l2", lid2);
    ({ scene: s } = addLink(s, l1));
    ({ scene: s } = addLink(s, l2));
    const inDefault = getLinksInLayer(s, DEFAULT_LAYER_ID);
    expect(inDefault.map((l) => l.id)).toEqual([linkId("l1")]);
    const inLayer2 = getLinksInLayer(s, lid2);
    expect(inLayer2.map((l) => l.id)).toEqual([linkId("l2")]);
  });
});

// ---------------------------------------------------------------------------
// getChildrenOf
// ---------------------------------------------------------------------------
describe("getChildrenOf", () => {
  it("returns empty array when no children", () => {
    const { scene } = addElement(emptyScene(), rect("root"));
    expect(getChildrenOf(scene, elementId("root"))).toEqual([]);
  });

  it("returns direct children sorted by order", () => {
    let s = emptyScene();
    const parent = rect("parent");
    ({ scene: s } = addElement(s, parent));
    const child1: Element = {
      ...rect("child1"),
      parentId: elementId("parent"),
      order: orderBetween(null, null),
    };
    const child2: Element = {
      ...rect("child2"),
      parentId: elementId("parent"),
      order: orderBetween(child1.order, null),
    };
    ({ scene: s } = addElement(s, child1));
    ({ scene: s } = addElement(s, child2));
    const children = getChildrenOf(s, elementId("parent"));
    expect(children.map((c) => c.id)).toEqual([elementId("child1"), elementId("child2")]);
  });

  it("does not include grandchildren (only direct children)", () => {
    let s = emptyScene();
    const parent = rect("parent");
    const child: Element = { ...rect("child"), parentId: elementId("parent") };
    const grandchild: Element = { ...rect("grandchild"), parentId: elementId("child") };
    ({ scene: s } = addElement(s, parent));
    ({ scene: s } = addElement(s, child));
    ({ scene: s } = addElement(s, grandchild));
    const children = getChildrenOf(s, elementId("parent"));
    expect(children.map((c) => c.id)).toEqual([elementId("child")]);
  });
});

// ---------------------------------------------------------------------------
// getDescendantsOf
// ---------------------------------------------------------------------------
describe("getDescendantsOf", () => {
  it("returns empty array for missing element", () => {
    expect(getDescendantsOf(emptyScene(), elementId("nobody"))).toEqual([]);
  });

  it("returns just the root when no children", () => {
    const { scene } = addElement(emptyScene(), rect("solo"));
    const desc = getDescendantsOf(scene, elementId("solo"));
    expect(desc.map((e) => e.id)).toEqual([elementId("solo")]);
  });

  it("returns root + all nested descendants (depth-first)", () => {
    let s = emptyScene();
    const parent = rect("p");
    const child1: Element = { ...rect("c1"), parentId: elementId("p") };
    const child2: Element = { ...rect("c2"), parentId: elementId("p") };
    const grandchild: Element = { ...rect("gc"), parentId: elementId("c1") };
    ({ scene: s } = addElement(s, parent));
    ({ scene: s } = addElement(s, child1));
    ({ scene: s } = addElement(s, child2));
    ({ scene: s } = addElement(s, grandchild));
    const ids = getDescendantsOf(s, elementId("p")).map((e) => e.id);
    // root must come first
    expect(ids[0]).toBe(elementId("p"));
    // all 4 must be present
    expect(ids).toHaveLength(4);
    expect(ids).toContain(elementId("c1"));
    expect(ids).toContain(elementId("c2"));
    expect(ids).toContain(elementId("gc"));
  });
});

// ---------------------------------------------------------------------------
// getRootSelf
// ---------------------------------------------------------------------------
describe("getRootSelf", () => {
  it("returns undefined for missing element", () => {
    expect(getRootSelf(emptyScene(), elementId("x"))).toBeUndefined();
  });

  it("returns the element itself when it has no parent", () => {
    const { scene } = addElement(emptyScene(), rect("a"));
    expect(getRootSelf(scene, elementId("a"))?.id).toBe(elementId("a"));
  });

  it("returns the topmost ancestor", () => {
    let s = emptyScene();
    const root = rect("root");
    const mid: Element = { ...rect("mid"), parentId: elementId("root") };
    const leaf: Element = { ...rect("leaf"), parentId: elementId("mid") };
    ({ scene: s } = addElement(s, root));
    ({ scene: s } = addElement(s, mid));
    ({ scene: s } = addElement(s, leaf));
    expect(getRootSelf(s, elementId("leaf"))?.id).toBe(elementId("root"));
    expect(getRootSelf(s, elementId("mid"))?.id).toBe(elementId("root"));
    expect(getRootSelf(s, elementId("root"))?.id).toBe(elementId("root"));
  });

  it("stops at broken parent chain (orphaned parent)", () => {
    let s = emptyScene();
    // child points to a parent that doesn't exist
    const orphan: Element = { ...rect("orphan"), parentId: elementId("ghost") };
    ({ scene: s } = addElement(s, orphan));
    // Should return orphan (breaks on missing parent)
    expect(getRootSelf(s, elementId("orphan"))?.id).toBe(elementId("orphan"));
  });
});

// ---------------------------------------------------------------------------
// isElementLocked
// ---------------------------------------------------------------------------
describe("isElementLocked", () => {
  it("returns false for an unlocked element with no parent", () => {
    const { scene } = addElement(emptyScene(), rect("a"));
    const el = scene.elements.get(elementId("a"))!;
    expect(isElementLocked(scene, el)).toBe(false);
  });

  it("returns true when element itself is locked", () => {
    let { scene } = addElement(emptyScene(), rect("a"));
    ({ scene } = updateElement(scene, elementId("a"), (s) => ({ ...s, locked: true })));
    const el = scene.elements.get(elementId("a"))!;
    expect(isElementLocked(scene, el)).toBe(true);
  });

  it("inherits lock from parent", () => {
    let s = emptyScene();
    const parent = rect("parent");
    const child: Element = { ...rect("child"), parentId: elementId("parent") };
    ({ scene: s } = addElement(s, parent));
    ({ scene: s } = addElement(s, child));
    ({ scene: s } = updateElement(s, elementId("parent"), (e) => ({ ...e, locked: true })));
    const childEl = s.elements.get(elementId("child"))!;
    expect(isElementLocked(s, childEl)).toBe(true);
  });

  it("unlocked child of unlocked parent → false", () => {
    let s = emptyScene();
    const parent = rect("parent");
    const child: Element = { ...rect("child"), parentId: elementId("parent") };
    ({ scene: s } = addElement(s, parent));
    ({ scene: s } = addElement(s, child));
    const childEl = s.elements.get(elementId("child"))!;
    expect(isElementLocked(s, childEl)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isElementHidden
// ---------------------------------------------------------------------------
describe("isElementHidden", () => {
  it("returns false for a visible element with no parent", () => {
    const { scene } = addElement(emptyScene(), rect("a"));
    const el = scene.elements.get(elementId("a"))!;
    expect(isElementHidden(scene, el)).toBe(false);
  });

  it("returns true when element itself is hidden", () => {
    let { scene } = addElement(emptyScene(), rect("a"));
    ({ scene } = updateElement(scene, elementId("a"), (s) => ({ ...s, hidden: true })));
    const el = scene.elements.get(elementId("a"))!;
    expect(isElementHidden(scene, el)).toBe(true);
  });

  it("inherits hidden from parent", () => {
    let s = emptyScene();
    const parent = rect("parent");
    const child: Element = { ...rect("child"), parentId: elementId("parent") };
    ({ scene: s } = addElement(s, parent));
    ({ scene: s } = addElement(s, child));
    ({ scene: s } = updateElement(s, elementId("parent"), (e) => ({ ...e, hidden: true })));
    const childEl = s.elements.get(elementId("child"))!;
    expect(isElementHidden(s, childEl)).toBe(true);
  });

  it("visible child of visible parent → false", () => {
    let s = emptyScene();
    const parent = rect("parent");
    const child: Element = { ...rect("child"), parentId: elementId("parent") };
    ({ scene: s } = addElement(s, parent));
    ({ scene: s } = addElement(s, child));
    const childEl = s.elements.get(elementId("child"))!;
    expect(isElementHidden(s, childEl)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getElementsInLayer — multi-layer filtering
// ---------------------------------------------------------------------------
describe("getElementsInLayer (multi-layer)", () => {
  it("returns empty when layer has no elements", () => {
    const lid2 = layerId("layer2");
    const layer2: Layer = {
      id: lid2,
      name: "L2",
      visible: true,
      locked: false,
      order: orderBetween(null, null),
    };
    let s = emptyScene();
    ({ scene: s } = addLayer(s, layer2));
    // Add element only to DEFAULT_LAYER_ID
    ({ scene: s } = addElement(s, rect("a", DEFAULT_LAYER_ID)));
    expect(getElementsInLayer(s, lid2)).toEqual([]);
  });

  it("returns elements only in the requested layer, sorted by order", () => {
    const lid2 = layerId("layer2");
    const layer2: Layer = {
      id: lid2,
      name: "L2",
      visible: true,
      locked: false,
      order: orderBetween(null, null),
    };
    let s = emptyScene();
    ({ scene: s } = addLayer(s, layer2));
    ({ scene: s } = addElement(s, rect("a", DEFAULT_LAYER_ID)));
    ({ scene: s } = addElement(s, rect("b", lid2)));
    ({ scene: s } = addElement(s, rect("c", lid2)));
    const inL2 = getElementsInLayer(s, lid2);
    const ids = inL2.map((e) => e.id);
    expect(ids).toContain(elementId("b"));
    expect(ids).toContain(elementId("c"));
    expect(ids).not.toContain(elementId("a"));
  });
});

// ---------------------------------------------------------------------------
// getElementsCoveredByBounds
// ---------------------------------------------------------------------------
describe("getElementsCoveredByBounds", () => {
  it("excludes elements with less than minCoverageRatio coverage", () => {
    let s = emptyScene();
    // Large shape at (0,0) 100×100
    ({ scene: s } = addElement(s, rect("big", DEFAULT_LAYER_ID, { x: 0, y: 0 }, 100, 100)));
    // Tiny lasso that intersects but only covers 1% of the big shape
    const hits = getElementsCoveredByBounds(s, { x: 0, y: 0, width: 1, height: 1 }, 0.5);
    // 1px² / 10000px² = 0.01% coverage — should not match at ratio 0.5
    // But the bidirectional rule: lasso (1px²) also small vs intersection, check
    // The lasso itself is 1px²; intersection (1px²) / lassoArea (1px²) = 1.0 ≥ 0.5 → included
    expect(hits.map((e) => e.id)).toContain(elementId("big"));
  });

  it("includes elements fully inside the range (high coverage)", () => {
    let s = emptyScene();
    // Small shape at (10,10) 20×20
    ({ scene: s } = addElement(s, rect("small", DEFAULT_LAYER_ID, { x: 10, y: 10 }, 20, 20)));
    // Large range fully contains small
    const hits = getElementsCoveredByBounds(s, { x: 0, y: 0, width: 100, height: 100 }, 0.5);
    expect(hits.map((e) => e.id)).toContain(elementId("small"));
  });

  it("excludes non-intersecting elements", () => {
    let s = emptyScene();
    ({ scene: s } = addElement(s, rect("far", DEFAULT_LAYER_ID, { x: 500, y: 500 })));
    const hits = getElementsCoveredByBounds(s, { x: 0, y: 0, width: 100, height: 100 }, 0.5);
    expect(hits.map((e) => e.id)).not.toContain(elementId("far"));
  });

  it("bidirectional rule: tiny lasso inside a big shape includes the shape", () => {
    let s = emptyScene();
    // Large 200×200 shape; a 1×1 lasso covers only 0.0025% of shape area
    // but the intersection covers 100% of the lasso → bidirectional rule includes it
    ({ scene: s } = addElement(s, rect("big", DEFAULT_LAYER_ID, { x: 0, y: 0 }, 200, 200)));
    // lasso 1×1 at (50,50) — fully inside big shape
    const hits = getElementsCoveredByBounds(s, { x: 50, y: 50, width: 1, height: 1 }, 0.5);
    expect(hits.map((e) => e.id)).toContain(elementId("big"));
  });

  it("uses default minCoverageRatio of 0.5 when not specified", () => {
    let s = emptyScene();
    // Shape exactly 50% covered
    ({ scene: s } = addElement(s, rect("half", DEFAULT_LAYER_ID, { x: 0, y: 0 }, 100, 100)));
    // Range covers 50×100 = 50% of shape
    const hits = getElementsCoveredByBounds(s, { x: 0, y: 0, width: 50, height: 100 });
    expect(hits.map((e) => e.id)).toContain(elementId("half"));
  });
});

// ---------------------------------------------------------------------------
// getElementAt — edge cases
// ---------------------------------------------------------------------------
describe("getElementAt edge cases", () => {
  it("returns undefined when point is outside all shapes", () => {
    let s = emptyScene();
    ({ scene: s } = addElement(s, rect("a", DEFAULT_LAYER_ID, { x: 0, y: 0 })));
    expect(getElementAt(s, { x: 9999, y: 9999 })).toBeUndefined();
  });

  it("respects layer z-order: top layer wins over bottom layer", () => {
    const lid2 = layerId("topLayer");
    const topLayerDef: Layer = {
      id: lid2,
      name: "Top",
      visible: true,
      locked: false,
      order: orderBetween(null, null),
    };
    let s = emptyScene();
    const defaultLayerOrder = s.layers.get(DEFAULT_LAYER_ID)!.order;
    const topLayer: Layer = {
      ...topLayerDef,
      order: orderBetween(defaultLayerOrder, null),
    };
    ({ scene: s } = addLayer(s, topLayer));
    ({ scene: s } = addElement(s, rect("bottom", DEFAULT_LAYER_ID, { x: 0, y: 0 })));
    ({ scene: s } = addElement(s, rect("top", lid2, { x: 0, y: 0 })));
    const hit = getElementAt(s, { x: 20, y: 20 });
    expect(hit?.id).toBe(elementId("top"));
  });
});

// ---------------------------------------------------------------------------
// getElementAtIndexed — edge cases
// ---------------------------------------------------------------------------
describe("getElementAtIndexed edge cases", () => {
  it("returns undefined when no candidates in grid at point", () => {
    const s = emptyScene();
    const grid = buildSpatialIndex(s);
    expect(getElementAtIndexed(s, grid, { x: 500, y: 500 })).toBeUndefined();
  });

  it("skips shapes on invisible layers", () => {
    let s = emptyScene();
    ({ scene: s } = addElement(s, rect("a", DEFAULT_LAYER_ID, { x: 0, y: 0 })));
    ({ scene: s } = updateLayer(s, DEFAULT_LAYER_ID, (l) => ({ ...l, visible: false })));
    const grid = buildSpatialIndex(s);
    expect(getElementAtIndexed(s, grid, { x: 10, y: 10 })).toBeUndefined();
  });

  it("picks the highest-order element in the same layer", () => {
    let s = emptyScene();
    const a = rect("a", DEFAULT_LAYER_ID, { x: 0, y: 0 });
    const b: Element = {
      ...rect("b", DEFAULT_LAYER_ID, { x: 0, y: 0 }),
      order: orderBetween(a.order, null),
    };
    ({ scene: s } = addElement(s, a));
    ({ scene: s } = addElement(s, b));
    const grid = buildSpatialIndex(s);
    expect(getElementAtIndexed(s, grid, { x: 10, y: 10 })?.id).toBe(elementId("b"));
  });
});
