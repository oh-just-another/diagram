import { describe, expect, it } from "vitest";
import { shapeId } from "@oh-just-another/types";
import {
  addShape,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Shape,
} from "@oh-just-another/scene";
import {
  computeGroupResizePatches,
  type GroupResizeOrigin,
} from "../src/editor/applies/resize.js";

const image = (): Shape =>
  ({
    id: shapeId("img"),
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
  }) as unknown as Shape;

const sceneWith = (s: Shape) => addShape(emptyScene(), s).scene;

const originFor = (s: Shape): GroupResizeOrigin => ({
  shapes: new Map([
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
    const after = r.patches.map((p) => (p as { after: Shape }).after)[0]! as Shape & {
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

  it("unlocked resize WOULD distort (guards the lock is what preserves ratio)", () => {
    const s = image();
    const scene = sceneWith(s);
    const bounds = { x: 0, y: 0, width: 100, height: 50 };
    const r = computeGroupResizePatches(
      scene,
      originFor(s),
      "se",
      { x: 100, y: 10 },
      bounds,
      false, // not locked
    );
    const after = r.patches.map((p) => (p as { after: Shape }).after)[0]! as Shape & {
      width: number;
      height: number;
    };
    // Without the lock the ratio drifts from 2:1 — exactly what we
    // disallow for images by routing them through the locked path.
    expect(after.width / after.height).not.toBeCloseTo(100 / 50);
  });
});
