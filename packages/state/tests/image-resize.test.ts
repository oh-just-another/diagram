import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Element,
} from "@oh-just-another/scene";
import {
  computeGroupResizePatches,
  type GroupResizeOrigin,
} from "../src/editor/applies/resize.js";

const image = (): Element =>
  ({
    id: elementId("img"),
    layerId: DEFAULT_LAYER_ID,
    type: "image",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: orderBetween(null, null),
    style: {},
    src: "data:,",
    width: 100,
    height: 50, // 2:1 aspect
  }) as unknown as Element;

const sceneWith = (s: Element) => addElement(emptyScene(), s).scene;

const originFor = (s: Element): GroupResizeOrigin => ({
  elements: new Map([
    [s.id, { position: s.position, bounds: { x: 0, y: 0, width: 100, height: 50 }, scale: { x: 1, y: 1 } }],
  ]),
});

describe("image resize is aspect-locked (only scale, no distortion)", () => {
  it("a lopsided drag still scales width & height by the SAME factor", () => {
    const s = image();
    const scene = sceneWith(s);
    const bounds = { x: 0, y: 0, width: 100, height: 50 };
    // Drag the SE corner by a delta that, unlocked, would stretch width
    // far more than height (would distort). Aspect-lock must keep 2:1.
    const r = computeGroupResizePatches(
      scene,
      originFor(s),
      "se",
      { x: 100, y: 10 },
      bounds,
      true, // isAspectLocked
    );
    const after = r.patches.map((p) => (p as { after: Element }).after)[0]! as Element & {
      width: number;
      height: number;
    };
    // Aspect ratio preserved exactly.
    expect(after.width / after.height).toBeCloseTo(100 / 50);
    // And it actually grew (uniform scale takes the larger axis ratio:
    // width 100→200 ⇒ ×2, height 50→100).
    expect(after.width).toBeCloseTo(200);
    expect(after.height).toBeCloseTo(100);
  });

  it("a non-image (rectangle) WOULD distort under free group resize", () => {
    // Sanity: the free path distorts ordinary shapes — that's the
    // contrast the mixed-selection test below relies on.
    const rect = {
      id: elementId("r"),
      layerId: DEFAULT_LAYER_ID,
      type: "rectangle",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      width: 100,
      height: 50,
    } as unknown as Element;
    const scene = sceneWith(rect);
    const bounds = { x: 0, y: 0, width: 100, height: 50 };
    const r = computeGroupResizePatches(scene, originFor(rect), "se", { x: 100, y: 10 }, bounds, false);
    const after = (r.patches[0] as { after: Element & { width: number; height: number } }).after;
    expect(after.width / after.height).not.toBeCloseTo(100 / 50);
  });

  it("mixed selection: rectangle follows the box, image keeps its aspect", () => {
    const rect = {
      id: elementId("r"),
      layerId: DEFAULT_LAYER_ID,
      type: "rectangle",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      width: 100,
      height: 50,
    } as unknown as Element;
    const img = {
      id: elementId("img"),
      layerId: DEFAULT_LAYER_ID,
      type: "image",
      position: { x: 100, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      src: "data:,",
      width: 80,
      height: 40, // 2:1
    } as unknown as Element;
    let scene = emptyScene();
    ({ scene } = addElement(scene, rect));
    ({ scene } = addElement(scene, img));
    const origin: GroupResizeOrigin = {
      elements: new Map([
        [rect.id, { position: { x: 0, y: 0 }, bounds: { x: 0, y: 0, width: 100, height: 50 }, scale: { x: 1, y: 1 } }],
        [img.id, { position: { x: 100, y: 0 }, bounds: { x: 100, y: 0, width: 80, height: 40 }, scale: { x: 1, y: 1 } }],
      ]),
    };
    // Group box is 180×50. Drag SE corner non-uniformly: sx large, sy small.
    const bounds = { x: 0, y: 0, width: 180, height: 50 };
    const r = computeGroupResizePatches(scene, origin, "se", { x: 180, y: 10 }, bounds, false);
    const byId = new Map(
      r.patches.map((p) => {
        const a = (p as { after: Element & { width: number; height: number } }).after;
        return [a.id, a] as const;
      }),
    );
    const rectAfter = byId.get(rect.id)!;
    const imgAfter = byId.get(img.id)!;
    // sx = 360/180 = 2, sy = 60/50 = 1.2 → distinct axes.
    // Rectangle distorts (follows box): ratio changes from 2:1.
    expect(rectAfter.width / rectAfter.height).not.toBeCloseTo(100 / 50);
    // Image keeps 2:1 aspect — only scaled.
    expect(imgAfter.width / imgAfter.height).toBeCloseTo(80 / 40);
  });
});
