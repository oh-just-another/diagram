import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  apply,
  emptyScene,
  orderBetween,
  updateElement,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { AutoLayoutScheduler } from "../src/auto-layout-scheduler.js";

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

const build = (): { scene: Scene; sched: AutoLayoutScheduler; get: () => Scene } => {
  const o0 = orderBetween(null, null);
  const o1 = orderBetween(o0, null);
  const container: Element = {
    ...rect("p", null, 360, 100),
    position: { x: 0, y: 0 },
    metadata: {
      autoLayout: { kind: "wrap", gap: 10 },
      container: { dropZone: { x: 10, y: 10, width: 340, height: 80 }, padding: 10 },
    },
  };
  let scene = emptyScene();
  for (const el of [container, rect("a", "p", 100, 50, o0), rect("b", "p", 100, 50, o1)]) {
    scene = addElement(scene, el).scene;
  }
  const sched = new AutoLayoutScheduler({
    getScene: () => scene,
    applyPatch: (p) => {
      scene = apply(scene, p);
    },
    growContainer: () => undefined, // not needed for these positional assertions
    onMutated: () => undefined,
  });
  return { scene, sched, get: () => scene };
};

describe("wrap container re-anchors children when its drop-zone origin moves", () => {
  it("children follow the drop-zone top-left when the container is moved", () => {
    const { sched, get } = build();
    sched.runCheck(); // initial layout at drop-zone origin (10,10)
    expect(get().elements.get(elementId("a"))!.position).toEqual({ x: 10, y: 10 });
    expect(get().elements.get(elementId("b"))!.position).toEqual({ x: 120, y: 10 });

    // Move the container down by 100 → drop-zone origin becomes (10,110).
    let scene = get();
    scene = updateElement(scene, elementId("p"), (s) => ({
      ...s,
      position: { x: 0, y: 100 },
    })).scene;
    // Reflect the move into the scheduler's scene, then re-run.
    const sched2 = new AutoLayoutScheduler({
      getScene: () => scene,
      applyPatch: (p) => {
        scene = apply(scene, p);
      },
      growContainer: () => undefined,
      onMutated: () => undefined,
    });
    sched2.runCheck();
    // Children re-anchored at the new top-left (they were NOT moved by the
    // container move itself — absolute coords — so the reflow brings them along).
    expect(scene.elements.get(elementId("a"))!.position).toEqual({ x: 10, y: 110 });
    expect(scene.elements.get(elementId("b"))!.position).toEqual({ x: 120, y: 110 });
  });
});
