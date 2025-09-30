import { afterEach, describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  getAutoLayoutSpec,
  orderBetween,
  registerLayoutKind,
  runAutoLayout,
  unregisterLayoutKind,
  type Patch,
  type Element,
} from "../src/index.js";

const rect = (id: string, parentId?: string): Element =>
  ({
    id: elementId(id),
    layerId: DEFAULT_LAYER_ID,
    type: "rectangle",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    width: 40,
    height: 40,
    ...(parentId ? { parentId: elementId(parentId) } : {}),
  } as Element);

const container = (id: string, autoLayout: Record<string, unknown>): Element =>
  ({
    ...rect(id),
    metadata: { autoLayout },
  } as Element);

describe("pluggable layout registry", () => {
  afterEach(() => {
    unregisterLayoutKind("radial");
  });

  it("registers a custom kind and roundtrips through getAutoLayoutSpec", () => {
    registerLayoutKind<{ readonly radius: number }>({
      kind: "radial",
      parse: (m) => {
        const o = m as { kind?: string; radius?: number };
        if (typeof o.radius !== "number") return null;
        return { radius: o.radius };
      },
      run: () => null,
    });
    const parent = container("p", { kind: "radial", radius: 100 });
    const spec = getAutoLayoutSpec(parent) as { kind: string; radius?: number };
    expect(spec).not.toBeNull();
    expect(spec.kind).toBe("radial");
    expect(spec.radius).toBe(100);
  });

  it("runAutoLayout dispatches to the plugin's run() with children + origin", () => {
    let captured: { childrenCount: number; origin: { x: number; y: number } } | null = null;
    registerLayoutKind<{ readonly radius: number }>({
      kind: "radial",
      parse: (m) => {
        const o = m as { radius?: number };
        return typeof o.radius === "number" ? { radius: o.radius } : null;
      },
      run: (_scene, _parentId, children, origin) => {
        captured = { childrenCount: children.length, origin };
        return null;
      },
    });

    let scene = emptyScene();
    const parent = { ...container("p", { kind: "radial", radius: 50 }), position: { x: 7, y: 9 } };
    ({ scene } = addElement(scene, parent));
    ({ scene } = addElement(scene, rect("c1", "p")));
    ({ scene } = addElement(scene, rect("c2", "p")));

    runAutoLayout(scene, elementId("p"));
    expect(captured).not.toBeNull();
    expect(captured!.childrenCount).toBe(2);
    expect(captured!.origin).toEqual({ x: 7, y: 9 });
  });

  it("returns null for unknown kinds (not in registry)", () => {
    const parent = container("p", { kind: "unknown-foo" });
    const spec = getAutoLayoutSpec(parent);
    expect(spec).toBeNull();
  });

  it("plugin run() result is the patch returned by runAutoLayout", () => {
    const fakePatch: Patch = {
      kind: "shape",
      id: elementId("c1"),
      before: rect("c1", "p"),
      after: { ...rect("c1", "p"), position: { x: 100, y: 100 } },
    };
    registerLayoutKind<{ readonly tag: string }>({
      kind: "radial",
      parse: () => ({ tag: "x" }),
      run: () => fakePatch,
    });

    let scene = emptyScene();
    ({ scene } = addElement(scene, container("p", { kind: "radial" })));
    ({ scene } = addElement(scene, rect("c1", "p")));

    const out = runAutoLayout(scene, elementId("p"));
    expect(out).toBe(fakePatch);
  });
});
