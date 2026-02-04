import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { clampContainerToChildren } from "../src/editor/container-ops.js";
import { computeElementResize } from "../src/editor/applies/resize.js";

const rect = (
  id: string,
  parentId: string | null,
  w: number,
  h: number,
  order = orderBetween(null, null),
): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order,
  style: {},
  width: w,
  height: h,
  ...(parentId ? { parentId: elementId(parentId) } : {}),
});

// Wrap container "p" (360×100, padding 10 → inner 340×80) with three 100×50
// children. At 340 wide two fit per row; narrowing forces one-per-row.
const setup = (): { scene: Scene; container: Element } => {
  const o0 = orderBetween(null, null);
  const o1 = orderBetween(o0, null);
  const o2 = orderBetween(o1, null);
  const container: Element = {
    ...rect("p", null, 360, 100),
    position: { x: 0, y: 0 },
    minWidth: 200,
    minHeight: 200,
    noFlip: true,
    metadata: {
      autoLayout: { kind: "wrap", gap: 10 },
      container: { dropZone: { x: 10, y: 10, width: 340, height: 80 }, padding: 10 },
    },
  };
  let scene = emptyScene();
  for (const el of [
    container,
    rect("a", "p", 100, 50, o0),
    rect("b", "p", 100, 50, o1),
    rect("c", "p", 100, 50, o2),
  ]) {
    scene = addElement(scene, el).scene;
  }
  return { scene, container };
};

describe("wrap container resize clamp", () => {
  it("allows narrowing below the sum of child widths and grows down to fit the rewrap", () => {
    const { scene, container } = setup();
    // Try to narrow to 150 (< sum 3×100). Inner 130 → one child per row →
    // content height = 50*3 + 10*2 = 170 → min outer height 190.
    const out = clampContainerToChildren(
      scene,
      container,
      { x: 0, y: 0, width: 150, height: 100 },
      "e",
    );
    expect(out.width).toBe(150); // narrowing allowed
    expect(out.height).toBe(190); // grew DOWN to the wrapped content height
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it("floors width at the widest single child (+padding)", () => {
    const { scene, container } = setup();
    const out = clampContainerToChildren(
      scene,
      container,
      { x: 0, y: 0, width: 100, height: 100 },
      "e",
    );
    expect(out.width).toBe(120); // widest child 100 + padding 2×10
  });

  it("west handle floors width by shifting the left edge (east edge fixed)", () => {
    const { scene, container } = setup();
    const out = clampContainerToChildren(
      scene,
      container,
      { x: 0, y: 0, width: 100, height: 100 },
      "w",
    );
    expect(out.width).toBe(120);
    expect(out.x).toBe(-20); // shifted left so the right edge stays put
  });

  it("growing wider/taller is unconstrained", () => {
    const { scene, container } = setup();
    const out = clampContainerToChildren(
      scene,
      container,
      { x: 0, y: 0, width: 600, height: 400 },
      "se",
    );
    expect(out.width).toBe(600);
    expect(out.height).toBe(400);
  });

  it("auto-layout container without a stored noFlip flag still can't flip through its body", () => {
    // Strip the noFlip flag. `computeElementResize` must force noFlip anyway
    // because it's an auto-layout container, so dragging the west edge far
    // past the east edge keeps the east edge fixed and never mirrors.
    const { scene, container } = setup();
    const legacy = { ...container } as Element & { noFlip?: boolean };
    delete legacy.noFlip;
    let legacyScene = emptyScene();
    for (const el of [
      legacy as Element,
      rect("a", "p", 100, 50),
      rect("b", "p", 100, 50),
      rect("c", "p", 100, 50),
    ]) {
      legacyScene = addElement(legacyScene, el).scene;
    }
    const out = computeElementResize(
      legacyScene,
      container.id,
      "w",
      { x: 1000, y: 0 },
      { x: 0, y: 0, width: 360, height: 100 },
      (shape, raw, h) => clampContainerToChildren(legacyScene, shape, raw, h),
    );
    const next = out!.scene.elements.get(container.id) as Element & { width: number };
    expect(next.width).toBeGreaterThan(0); // not mirrored/negative
    // East edge stays put — control did NOT cross over to the opposite edge.
    expect(next.position.x + next.width).toBeCloseTo(360, 0);
  });

  it("noFlip + minWidth: dragging the left edge past the right doesn't mirror, floors at 200", () => {
    const { scene, container } = setup();
    // Drag the west edge 1000px right — would mirror the box without noFlip.
    const out = computeElementResize(
      scene,
      container.id,
      "w",
      { x: 1000, y: 0 },
      { x: 0, y: 0, width: 360, height: 100 },
      (shape, raw, h) => clampContainerToChildren(scene, shape, raw, h),
    );
    const next = out!.scene.elements.get(container.id) as Element & { width: number };
    expect(next.width).toBe(200); // floored at minWidth (= max(200, content)); no flip
    expect(next.width).toBeGreaterThan(0); // not mirrored/negative
    // East edge stays put (west handle keeps the opposite edge fixed).
    expect(next.position.x + next.width).toBeCloseTo(360, 0);
  });
});
