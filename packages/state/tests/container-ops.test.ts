import { describe, expect, it } from "vitest";
import { elementId, type Bounds } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  getDropZoneWorld,
  orderBetween,
  type Element,
  type Patch,
  type Scene,
} from "@oh-just-another/scene";
import {
  applyContainerDrop,
  childrenWorldUnion,
  clampContainerToChildren,
  coverageRatio,
  maybeGrowContainer,
  type ContainerOpsRef,
} from "../src/editor/container-ops.js";

const bounds = (x: number, y: number, width: number, height: number): Bounds => ({
  x,
  y,
  width,
  height,
});

/** Plain rectangle element. `parentId` is set only when non-null. */
const rect = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  parentId: string | null = null,
  order = orderBetween(null, null),
): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order,
  style: {},
  width: w,
  height: h,
  ...(parentId ? { parentId: elementId(parentId) } : {}),
});

/**
 * Static container: carries a `metadata.container.dropZone` (local coords) and
 * `padding`, which `getContainerSpec` reads directly — no resolver needed.
 */
const container = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  zone: Bounds,
  padding = 8,
): Element => ({
  ...rect(id, x, y, w, h),
  metadata: { container: { dropZone: zone, padding } },
});

const group = (id: string, x = 0, y = 0): Element => ({
  ...rect(id, x, y, 10, 10),
  type: "group",
});

const sceneOf = (shapes: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of shapes) s = addElement(s, sh).scene;
  return s;
};

/** Recording `ContainerOpsRef` — captures every `applyPatch` and advances `scene`. */
const makeRef = (
  scene: Scene,
  dragElementId: string | null,
  hoverId: string | null,
): ContainerOpsRef & {
  readonly applied: { patch: Patch; scene: Scene }[];
  current(): Scene;
} => {
  const applied: { patch: Patch; scene: Scene }[] = [];
  let current = scene;
  const ref: ContainerOpsRef = {
    get scene() {
      return current;
    },
    dragElementId: dragElementId ? elementId(dragElementId) : null,
    containerHover: hoverId ? { id: elementId(hoverId) } : null,
    applyPatch(patch, nextScene) {
      applied.push({ patch, scene: nextScene });
      current = nextScene;
    },
  };
  return Object.assign(ref, { applied, current: () => current });
};

describe("coverageRatio", () => {
  it("fully-contained child → 1", () => {
    expect(coverageRatio(bounds(10, 10, 20, 20), bounds(0, 0, 100, 100))).toBeCloseTo(1, 6);
  });

  it("half-overlapping child → 0.5", () => {
    // child 0..20 wide, zone starts at 10 → 10px (half) inside.
    const r = coverageRatio(bounds(0, 0, 20, 20), bounds(10, 0, 100, 20));
    expect(r).toBeCloseTo(0.5, 6);
  });

  it("quarter overlap (both axes half) → 0.25", () => {
    const r = coverageRatio(bounds(0, 0, 20, 20), bounds(10, 10, 100, 100));
    expect(r).toBeCloseTo(0.25, 6);
  });

  it("disjoint bounds → 0", () => {
    expect(coverageRatio(bounds(0, 0, 10, 10), bounds(100, 100, 10, 10))).toBe(0);
  });

  it("edge-touching (zero-area intersection) → 0", () => {
    // child right edge at x=10, zone starts at x=10 → iw = 0.
    expect(coverageRatio(bounds(0, 0, 10, 10), bounds(10, 0, 10, 10))).toBe(0);
  });

  it("degenerate (zero-area) child → 0", () => {
    expect(coverageRatio(bounds(0, 0, 0, 50), bounds(0, 0, 100, 100))).toBe(0);
    expect(coverageRatio(bounds(0, 0, 50, 0), bounds(0, 0, 100, 100))).toBe(0);
  });
});

describe("childrenWorldUnion", () => {
  it("returns null when the container has no children", () => {
    const c = container("c", 0, 0, 100, 100, bounds(8, 8, 84, 84));
    const scene = sceneOf([c]);
    expect(childrenWorldUnion(scene, c.id)).toBeNull();
  });

  it("single child → that child's world bounds", () => {
    const c = container("c", 0, 0, 200, 200, bounds(8, 8, 184, 184));
    const child = rect("ch", 20, 30, 40, 50, "c");
    const scene = sceneOf([c, child]);
    expect(childrenWorldUnion(scene, c.id)).toEqual(bounds(20, 30, 40, 50));
  });

  it("many children → union AABB of all of them", () => {
    const c = container("c", 0, 0, 400, 400, bounds(8, 8, 384, 384));
    const a = rect("a", 10, 10, 20, 20, "c");
    const b = rect("b", 100, 200, 30, 40, "c"); // extends to (130, 240)
    const scene = sceneOf([c, a, b]);
    expect(childrenWorldUnion(scene, c.id)).toEqual(bounds(10, 10, 120, 230));
  });

  it("ignores shapes parented elsewhere", () => {
    const c = container("c", 0, 0, 200, 200, bounds(8, 8, 184, 184));
    const mine = rect("mine", 10, 10, 20, 20, "c");
    const other = rect("other", 500, 500, 20, 20, "someone-else");
    const scene = sceneOf([c, mine, other]);
    expect(childrenWorldUnion(scene, c.id)).toEqual(bounds(10, 10, 20, 20));
  });
});

describe("clampContainerToChildren", () => {
  it("returns raw unchanged when the shape is not a container", () => {
    const plain = rect("p", 0, 0, 100, 100);
    const scene = sceneOf([plain]);
    const raw = bounds(0, 0, 50, 50);
    expect(clampContainerToChildren(scene, plain, raw, "se")).toBe(raw);
  });

  it("returns raw unchanged when the container has no children", () => {
    const c = container("c", 0, 0, 200, 200, bounds(0, 0, 200, 200), 0);
    const scene = sceneOf([c]);
    const raw = bounds(0, 0, 80, 80);
    expect(clampContainerToChildren(scene, c, raw, "se")).toBe(raw);
  });

  it("east handle: floors width so the drop-zone still covers the child's right edge", () => {
    // Drop-zone right edge fixed at 100 (the stored zone width doesn't scale).
    // Child extends to x=150 past the zone → east floor bumps width by 50.
    const c = container("c", 0, 0, 200, 200, bounds(0, 0, 100, 200), 0);
    const child = rect("ch", 0, 0, 150, 20, "c");
    const scene = sceneOf([c, child]);
    // raw.width 100 + (childRight 150 − zoneRight 100) = 150.
    const out = clampContainerToChildren(scene, c, bounds(0, 0, 100, 200), "e");
    expect(out.width).toBe(150);
    expect(out.x).toBe(0);
  });

  it("south handle: floors height to cover the child's bottom edge", () => {
    // Drop-zone bottom fixed at 100; child extends to y=150 → south floor +50.
    const c = container("c", 0, 0, 200, 200, bounds(0, 0, 200, 100), 0);
    const child = rect("ch", 0, 0, 20, 150, "c");
    const scene = sceneOf([c, child]);
    const out = clampContainerToChildren(scene, c, bounds(0, 0, 200, 100), "s");
    expect(out.height).toBe(150);
    expect(out.y).toBe(0);
  });

  it("west handle: floors width by shifting the left edge, keeping east fixed", () => {
    // Child sits at world x=-30 (left of the container origin); narrowing from
    // the west must extend left to keep it covered.
    const c = container("c", 0, 0, 200, 200, bounds(0, 0, 200, 200), 0);
    const child = rect("ch", -30, 0, 20, 20, "c"); // child left = -30
    const scene = sceneOf([c, child]);
    // Drag west edge to x=10 (raw x=10,width=190). zone left 10 > child left -30
    // → shift left by 40: x -= 40 → -30, width += 40 → 230.
    const out = clampContainerToChildren(scene, c, bounds(10, 0, 190, 200), "w");
    expect(out.x).toBe(-30);
    expect(out.width).toBe(230);
  });

  it("north handle: floors height by shifting the top edge, keeping south fixed", () => {
    const c = container("c", 0, 0, 200, 200, bounds(0, 0, 200, 200), 0);
    const child = rect("ch", 0, -25, 20, 20, "c"); // child top = -25
    const scene = sceneOf([c, child]);
    const out = clampContainerToChildren(scene, c, bounds(0, 10, 200, 190), "n");
    expect(out.y).toBe(-25);
    expect(out.height).toBe(225);
  });

  it("growing the container leaves raw untouched (zone already covers children)", () => {
    const c = container("c", 0, 0, 200, 200, bounds(0, 0, 200, 200), 0);
    const child = rect("ch", 0, 0, 50, 50, "c");
    const scene = sceneOf([c, child]);
    const raw = bounds(0, 0, 400, 400);
    const out = clampContainerToChildren(scene, c, raw, "se");
    expect(out).toEqual(raw);
  });
});

describe("maybeGrowContainer", () => {
  it("no-op when the child already fits inside the drop-zone", () => {
    const c = container("c", 0, 0, 200, 200, bounds(0, 0, 200, 200), 0);
    const child = rect("ch", 10, 10, 20, 20, "c");
    const scene = sceneOf([c, child]);
    const ref = makeRef(scene, "ch", "c");
    maybeGrowContainer(ref, c.id, child.id);
    expect(ref.applied).toHaveLength(0);
  });

  it("grows zone + outer size + position when the child overflows the zone", () => {
    // Zone is the full 200×200 box (padding 0). Child sticks out to x=250.
    const c = container("c", 0, 0, 200, 200, bounds(0, 0, 200, 200), 0);
    const child = rect("ch", 200, 0, 50, 50, "c"); // right edge = 250 > 200
    const scene = sceneOf([c, child]);
    const ref = makeRef(scene, "ch", "c");
    maybeGrowContainer(ref, c.id, child.id);
    expect(ref.applied).toHaveLength(1);
    const grown = ref.current().elements.get(c.id) as Element & {
      width: number;
      height: number;
      metadata: { container: { dropZone: Bounds } };
    };
    // Width grows by the 50px overhang on the right (padding 0).
    expect(grown.width).toBe(250);
    expect(grown.metadata.container.dropZone.width).toBe(250);
    // Right-edge growth doesn't move the origin.
    expect(grown.position.x).toBe(0);
  });

  it("no-op when the target is not a container (no spec)", () => {
    const plain = rect("p", 0, 0, 100, 100);
    const child = rect("ch", 0, 0, 500, 500, "p");
    const scene = sceneOf([plain, child]);
    const ref = makeRef(scene, "ch", "p");
    maybeGrowContainer(ref, plain.id, child.id);
    expect(ref.applied).toHaveLength(0);
  });

  it("no-op when the container or child id is missing", () => {
    const c = container("c", 0, 0, 200, 200, bounds(0, 0, 200, 200), 0);
    const scene = sceneOf([c]);
    const ref = makeRef(scene, null, "c");
    maybeGrowContainer(ref, c.id, elementId("ghost"));
    expect(ref.applied).toHaveLength(0);
  });
});

describe("applyContainerDrop", () => {
  it("no-op when there is no dragged element", () => {
    const c = container("c", 0, 0, 200, 200, bounds(0, 0, 200, 200), 0);
    const scene = sceneOf([c]);
    const ref = makeRef(scene, null, "c");
    applyContainerDrop(ref, null);
    expect(ref.applied).toHaveLength(0);
  });

  it("reparents into a hovered container that is not the current parent", () => {
    const c = container("c", 0, 0, 300, 300, bounds(0, 0, 300, 300), 0);
    const child = rect("ch", 20, 20, 30, 30, null); // no parent yet
    const scene = sceneOf([c, child]);
    const ref = makeRef(scene, "ch", "c");
    applyContainerDrop(ref, null);
    const updated = ref.current().elements.get(child.id);
    expect(updated?.parentId).toBe(c.id);
    // Reparent patch (+ possibly a grow patch) recorded.
    expect(ref.applied.length).toBeGreaterThanOrEqual(1);
  });

  it("drag-within the same parent grows the parent when the child overflows", () => {
    const c = container("c", 0, 0, 200, 200, bounds(0, 0, 200, 200), 0);
    const child = rect("ch", 180, 0, 80, 40, "c"); // overflows right edge (260)
    const scene = sceneOf([c, child]);
    const ref = makeRef(scene, "ch", "c"); // hover == current parent
    applyContainerDrop(ref, null);
    const grown = ref.current().elements.get(c.id) as Element & { width: number };
    expect(grown.width).toBeGreaterThan(200);
  });

  it("no hover but coverage ≥ threshold keeps the parent (grows, no un-parent)", () => {
    const c = container("c", 0, 0, 200, 200, bounds(0, 0, 200, 200), 0);
    // Child fully inside the zone → coverage 1 ≥ 0.5 → stays parented.
    const child = rect("ch", 50, 50, 40, 40, "c");
    const scene = sceneOf([c, child]);
    const ref = makeRef(scene, "ch", null); // no hover
    applyContainerDrop(ref, null);
    const updated = ref.current().elements.get(child.id);
    expect(updated?.parentId).toBe(c.id); // still parented
  });

  it("no hover and coverage < threshold un-parents (drag-out)", () => {
    const c = container("c", 0, 0, 200, 200, bounds(0, 0, 200, 200), 0);
    // Child mostly outside the zone → coverage < 0.5 → drag-out.
    const child = rect("ch", 180, 180, 60, 60, "c"); // only a small corner overlaps
    const scene = sceneOf([c, child]);
    const ref = makeRef(scene, "ch", null);
    applyContainerDrop(ref, null);
    const updated = ref.current().elements.get(child.id);
    expect(updated?.parentId).toBeUndefined(); // un-parented
  });

  it("never drags a child out of a group parent regardless of bounds", () => {
    const g = group("g");
    // Child far outside the group's footprint — but group has no drop-zone, so
    // the coverage/drag-out branch must be skipped entirely.
    const child = rect("ch", 9000, 9000, 50, 50, "g");
    const scene = sceneOf([g, child]);
    const ref = makeRef(scene, "ch", null);
    applyContainerDrop(ref, null);
    expect(ref.applied).toHaveLength(0);
    expect(ref.current().elements.get(child.id)?.parentId).toBe(g.id);
  });

  it("no-op when the dragged shape has no parent and no hover", () => {
    const child = rect("ch", 0, 0, 30, 30, null);
    const scene = sceneOf([child]);
    const ref = makeRef(scene, "ch", null);
    applyContainerDrop(ref, null);
    expect(ref.applied).toHaveLength(0);
  });
});

describe("getDropZoneWorld (sanity for fixtures)", () => {
  it("offsets the local zone by the container position", () => {
    const c = container("c", 100, 50, 200, 200, bounds(8, 8, 184, 184));
    expect(getDropZoneWorld(c)).toEqual(bounds(108, 58, 184, 184));
  });
});
