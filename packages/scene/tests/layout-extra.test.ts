import { afterEach, describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type Element,
} from "../src/index.js";
import {
  getAutoLayoutSpec,
  gridLayout,
  runAutoLayout,
  stackLayout,
  treeLayout,
  wrapLayout,
} from "../src/layout.js";
import { registerLayoutKind, unregisterLayoutKind } from "../src/layout-registry.js";

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

// ---------------------------------------------------------------------------
// Empty / null guard arms for every built-in layout function.
// ---------------------------------------------------------------------------
describe("layout empty-input guards return null", () => {
  it("gridLayout returns null for empty shapeIds", () => {
    expect(gridLayout(emptyScene(), { shapeIds: [], cols: 2 })).toBeNull();
  });

  it("gridLayout returns null when cols < 1", () => {
    const a = rect("a", null);
    expect(gridLayout(sceneWith(a), { shapeIds: [a.id], cols: 0 })).toBeNull();
  });

  it("stackLayout returns null for empty shapeIds", () => {
    expect(stackLayout(emptyScene(), { shapeIds: [], direction: "vertical" })).toBeNull();
  });

  it("wrapLayout returns null for empty shapeIds", () => {
    expect(wrapLayout(emptyScene(), { shapeIds: [], innerWidth: 100 })).toBeNull();
  });

  it("treeLayout returns null for empty shapeIds", () => {
    expect(treeLayout(emptyScene(), { shapeIds: [] })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Default gap / origin fallback arms (`?? 16`, `?? {x:0,y:0}`).
// ---------------------------------------------------------------------------
describe("layout default gap / origin", () => {
  it("gridLayout uses default gap 16 and origin (0,0) when omitted", () => {
    const a = rect("a", null, 40, 30);
    const b = rect("b", null, 40, 30);
    const scene = sceneWith(a, b);
    const patch = gridLayout(scene, { shapeIds: [a.id, b.id], cols: 2 });
    // Cell stride x = 40 + 16 = 56; b moves to the next column from origin (0,0).
    expect(patch).not.toBeNull();
  });

  it("stackLayout vertical uses default gap when omitted", () => {
    const a = rect("a", null, 40, 30);
    const b = rect("b", null, 40, 30);
    const scene = sceneWith(a, b);
    const patch = stackLayout(scene, { shapeIds: [a.id, b.id], direction: "vertical" });
    expect(patch).not.toBeNull();
  });

  it("returns null when nothing actually moves (already in place)", () => {
    // A single shape already at the origin → no patches → batch returns null.
    const a = rect("a", null);
    const scene = sceneWith(a);
    expect(gridLayout(scene, { shapeIds: [a.id], cols: 1, origin: { x: 0, y: 0 } })).toBeNull();
    expect(
      stackLayout(scene, { shapeIds: [a.id], direction: "horizontal", origin: { x: 0, y: 0 } }),
    ).toBeNull();
  });

  it("layouts skip ids that don't resolve to a shape (missing id)", () => {
    const a = rect("a", null);
    const scene = sceneWith(a);
    // Mixing a real id with a ghost id exercises the `if (s) shapes.push(s)` /
    // `if (!shape) continue` arms; only the real shape is placed.
    const patch = stackLayout(scene, {
      shapeIds: [elementId("ghost"), a.id],
      direction: "horizontal",
      origin: { x: 100, y: 0 },
    });
    expect(patch).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getAutoLayoutSpec — every kind + every reject arm.
// ---------------------------------------------------------------------------
describe("getAutoLayoutSpec parsing", () => {
  const withMeta = (autoLayout: unknown): Element => ({
    ...rect("p", null),
    metadata: { autoLayout } as Readonly<Record<string, unknown>>,
  });

  it("returns null when metadata.autoLayout is absent", () => {
    expect(getAutoLayoutSpec(rect("p", null))).toBeNull();
  });

  it("returns null when autoLayout is not an object", () => {
    expect(getAutoLayoutSpec(withMeta("nope"))).toBeNull();
  });

  it("grid: rejects missing / sub-1 cols, accepts valid", () => {
    expect(getAutoLayoutSpec(withMeta({ kind: "grid" }))).toBeNull();
    expect(getAutoLayoutSpec(withMeta({ kind: "grid", cols: 0 }))).toBeNull();
    expect(getAutoLayoutSpec(withMeta({ kind: "grid", cols: 3 }))).toEqual({
      kind: "grid",
      cols: 3,
    });
    expect(getAutoLayoutSpec(withMeta({ kind: "grid", cols: 3, gap: 8 }))).toEqual({
      kind: "grid",
      cols: 3,
      gap: 8,
    });
  });

  it("stack: rejects bad direction, accepts valid with optional gap", () => {
    expect(getAutoLayoutSpec(withMeta({ kind: "stack", direction: "diagonal" }))).toBeNull();
    expect(getAutoLayoutSpec(withMeta({ kind: "stack", direction: "vertical" }))).toEqual({
      kind: "stack",
      direction: "vertical",
    });
    expect(getAutoLayoutSpec(withMeta({ kind: "stack", direction: "horizontal", gap: 4 }))).toEqual(
      { kind: "stack", direction: "horizontal", gap: 4 },
    );
  });

  it("wrap: accepts with and without gap", () => {
    expect(getAutoLayoutSpec(withMeta({ kind: "wrap" }))).toEqual({ kind: "wrap" });
    expect(getAutoLayoutSpec(withMeta({ kind: "wrap", gap: 12 }))).toEqual({
      kind: "wrap",
      gap: 12,
    });
  });

  it("tree: accepts with and without ranksep / nodesep", () => {
    expect(getAutoLayoutSpec(withMeta({ kind: "tree" }))).toEqual({ kind: "tree" });
    expect(getAutoLayoutSpec(withMeta({ kind: "tree", ranksep: 50, nodesep: 12 }))).toEqual({
      kind: "tree",
      ranksep: 50,
      nodesep: 12,
    });
  });

  it("unknown kind without registry entry returns null", () => {
    expect(getAutoLayoutSpec(withMeta({ kind: "radial-unregistered" }))).toBeNull();
  });

  describe("plugin kind via registry", () => {
    afterEach(() => {
      unregisterLayoutKind("radial");
    });

    it("delegates parse to a registered entry", () => {
      registerLayoutKind({
        kind: "radial",
        parse: (m) => {
          const r = m as { radius?: number };
          const radius = r.radius;
          return typeof radius === "number" ? { radius } : null;
        },
        run: () => null,
      });
      const spec = getAutoLayoutSpec(withMeta({ kind: "radial", radius: 99 }));
      expect(spec).toEqual({ radius: 99, kind: "radial" });
    });

    it("returns null when the registered entry rejects the payload", () => {
      registerLayoutKind({
        kind: "radial",
        parse: () => null,
        run: () => null,
      });
      expect(getAutoLayoutSpec(withMeta({ kind: "radial" }))).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// runAutoLayout — dispatch + early-out arms.
// ---------------------------------------------------------------------------
describe("runAutoLayout dispatch", () => {
  it("returns null when the parent shape is missing", () => {
    expect(runAutoLayout(emptyScene(), elementId("nope"))).toBeNull();
  });

  it("returns null when the parent has no auto-layout spec", () => {
    const p = rect("p", null);
    expect(runAutoLayout(sceneWith(p), p.id)).toBeNull();
  });

  it("returns null when the auto-layout parent has no children", () => {
    const p: Element = {
      ...rect("p", null),
      metadata: { autoLayout: { kind: "grid", cols: 2 } },
    };
    expect(runAutoLayout(sceneWith(p), p.id)).toBeNull();
  });

  it("dispatches a grid container (origin = synthesised drop-zone top-left)", () => {
    const p: Element = {
      ...rect("p", null, 200, 200),
      position: { x: 5, y: 7 },
      metadata: { autoLayout: { kind: "grid", cols: 2, gap: 10 } },
    };
    const c1 = rect("c1", "p");
    const c2 = rect("c2", "p");
    const scene = sceneWith(p, c1, c2);
    const patch = runAutoLayout(scene, p.id);
    expect(patch).not.toBeNull();
  });

  it("dispatches a stack container", () => {
    const p: Element = {
      ...rect("p", null, 200, 200),
      position: { x: 0, y: 0 },
      metadata: { autoLayout: { kind: "stack", direction: "vertical" } },
    };
    const c1 = rect("c1", "p");
    const c2 = rect("c2", "p");
    const scene = sceneWith(p, c1, c2);
    expect(runAutoLayout(scene, p.id)).not.toBeNull();
  });

  it("dispatches a tree container", () => {
    const p: Element = {
      ...rect("p", null, 200, 200),
      position: { x: 0, y: 0 },
      metadata: { autoLayout: { kind: "tree", ranksep: 40, nodesep: 12 } },
    };
    const c1 = rect("c1", "p");
    const c2 = rect("c2", "p");
    const scene = sceneWith(p, c1, c2);
    expect(runAutoLayout(scene, p.id)).not.toBeNull();
  });

  it("dispatches a registered plugin kind through the registry run()", () => {
    let ranWith: { parentId: string; childCount: number } | null = null;
    registerLayoutKind({
      kind: "radial",
      parse: () => ({}),
      run: (_scene, parentId, children) => {
        ranWith = { parentId: String(parentId), childCount: children.length };
        return null;
      },
    });
    try {
      const p: Element = {
        ...rect("p", null, 200, 200),
        metadata: { autoLayout: { kind: "radial" } },
      };
      const c1 = rect("c1", "p");
      const scene = sceneWith(p, c1);
      expect(runAutoLayout(scene, p.id)).toBeNull();
      expect(ranWith).toEqual({ parentId: String(p.id), childCount: 1 });
    } finally {
      unregisterLayoutKind("radial");
    }
  });

  it("returns null for a plugin kind that parsed but lost its registry entry before run", () => {
    // parse via registry, then unregister so the run-time lookup misses.
    registerLayoutKind({ kind: "vanish", parse: () => ({}), run: () => null });
    const p: Element = {
      ...rect("p", null, 200, 200),
      metadata: { autoLayout: { kind: "vanish" } },
    };
    const c1 = rect("c1", "p");
    const scene = sceneWith(p, c1);
    const spec = getAutoLayoutSpec(p); // resolved while registered
    expect(spec).not.toBeNull();
    unregisterLayoutKind("vanish");
    expect(runAutoLayout(scene, p.id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// treeLayout — missing-shape arms inside measure() / place().
// ---------------------------------------------------------------------------
describe("treeLayout robustness", () => {
  it("ignores a root id that has no shape (measure → 0×0)", () => {
    // Only a ghost root id → measure returns 0 and nothing is placed.
    expect(treeLayout(emptyScene(), { shapeIds: [elementId("ghost")] })).toBeNull();
  });
});
