import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addShape,
  containerSizeForZone,
  emptyScene,
  expandDropZoneToFit,
  findContainerAt,
  getContainerSpec,
  getDropZoneWorld,
  isContainer,
  orderBetween,
  DEFAULT_LAYER_ID,
  type Shape,
} from "../src/index";

const container = (id: string, x: number, y: number): Shape => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 400,
  height: 200,
  metadata: {
    container: {
      dropZone: { x: 10, y: 40, width: 380, height: 150 },
      padding: 8,
    },
  },
});

describe("container protocol", () => {
  it("isContainer + getContainerSpec read metadata.container", () => {
    const c = container("c", 100, 50);
    expect(isContainer(c)).toBe(true);
    const spec = getContainerSpec(c);
    expect(spec).not.toBeNull();
    expect(spec!.dropZone).toEqual({ x: 10, y: 40, width: 380, height: 150 });
    expect(spec!.padding).toBe(8);
  });

  it("isContainer is false for plain shapes", () => {
    const r: Shape = { ...container("r", 0, 0), metadata: {} };
    expect(isContainer(r)).toBe(false);
    expect(getContainerSpec(r)).toBeNull();
  });

  it("getDropZoneWorld translates to world coords", () => {
    const c = container("c", 100, 50);
    expect(getDropZoneWorld(c)).toEqual({ x: 110, y: 90, width: 380, height: 150 });
  });

  it("findContainerAt picks the topmost container under cursor", () => {
    let scene = emptyScene();
    ({ scene } = addShape(scene, container("c1", 0, 0)));
    // c2 is on top — it should win.
    ({ scene } = addShape(scene, container("c2", 50, 50)));
    const hit = findContainerAt(scene, { x: 200, y: 150 });
    expect(hit?.id).toBe(elementId("c2"));
  });

  it("findContainerAt respects exclude set", () => {
    let scene = emptyScene();
    ({ scene } = addShape(scene, container("c1", 0, 0)));
    const exclude = new Set([elementId("c1")]);
    expect(findContainerAt(scene, { x: 200, y: 100 }, exclude)).toBeNull();
  });

  it("expandDropZoneToFit returns null when child already fits", () => {
    const c = container("c", 0, 0);
    const childInside = { x: 20, y: 60, width: 100, height: 50 };
    expect(expandDropZoneToFit(c, childInside)).toBeNull();
  });

  it("expandDropZoneToFit grows the zone by child + padding", () => {
    const c = container("c", 0, 0);
    const childOutside = { x: 600, y: 60, width: 50, height: 50 };
    const next = expandDropZoneToFit(c, childOutside);
    expect(next).not.toBeNull();
    // Right edge should reach child.x+w+padding = 600+50+8 = 658.
    expect(next!.x + next!.width).toBe(658);
  });

  it("containerSizeForZone preserves the zone offset within the shape", () => {
    const spec = getContainerSpec(container("c", 0, 0))!;
    const next = containerSizeForZone(
      { width: 400, height: 200, spec },
      { x: spec.dropZone.x, y: spec.dropZone.y, width: 600, height: 150 },
    );
    // Grown only on width by 220, without shifting position.
    expect(next.width).toBe(620);
    expect(next.height).toBe(200);
    expect(Object.is(next.positionOffset.x, -0) ? 0 : next.positionOffset.x).toBe(0);
    expect(Object.is(next.positionOffset.y, -0) ? 0 : next.positionOffset.y).toBe(0);
  });

  // The per-edge guard makes `expandDropZoneToFit` a true no-op for a
  // child resting exactly on the zone's top-left corner: `padding` is
  // not subtracted from an edge the child does not cross.
  it("expandDropZoneToFit is a no-op when child rests on the zone's top-left edge", () => {
    // Container at world origin, dropZone (10, 40, 380, 150), padding 8.
    const c = container("c", 0, 0);
    // Child at the zone's exact corner — same x, same y, well within
    // width/height.
    const childOnEdge = { x: 10, y: 40, width: 80, height: 60 };
    expect(expandDropZoneToFit(c, childOnEdge)).toBeNull();
  });

  it("expandDropZoneToFit grows only on the side the child crossed", () => {
    const c = container("c", 0, 0);
    // Child past the right edge, but vertically fully inside.
    const childRight = { x: 500, y: 60, width: 100, height: 50 };
    const next = expandDropZoneToFit(c, childRight)!;
    // Right grows by (crossed-amount + padding); left untouched.
    expect(next.x).toBe(10);
    expect(next.y).toBe(40);
    expect(next.x + next.width).toBe(500 + 100 + 8);
    expect(next.height).toBe(150);
  });

  // Auto-layout shapes carry both `metadata.autoLayout` and a static
  // `metadata.container` baseline. When autoLayout is present the live
  // synthesiser derives the drop-zone from the current width/height and
  // ignores the stored `dropZone`, so the area tracks user resize.
  const autoGrid = (id: string, w: number, h: number): Shape => ({
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
    metadata: {
      autoLayout: { kind: "grid", cols: 2, gap: 12 },
      container: {
        // Stored zone is intentionally stale (matches a smaller
        // size). The live synthesiser should ignore it.
        dropZone: { x: 12, y: 12, width: 100, height: 100 },
        padding: 12,
      },
    },
  });

  it("getContainerSpec synthesises a live drop-zone for autoLayout shapes (sized to current width/height)", () => {
    const shape = autoGrid("g", 320, 200);
    const spec = getContainerSpec(shape)!;
    // padding 12, shape 320×200 → zone 296×176, NOT the stale 100×100.
    expect(spec.dropZone).toEqual({ x: 12, y: 12, width: 296, height: 176 });
    expect(spec.padding).toBe(12);
  });

  it("getContainerSpec re-derives the drop-zone after the shape's width changes", () => {
    const before = autoGrid("g", 320, 200);
    const after = { ...before, width: 500, height: 280 };
    const spec = getContainerSpec(after)!;
    expect(spec.dropZone).toEqual({ x: 12, y: 12, width: 476, height: 256 });
  });

  it("getContainerSpec clamps the synthesised drop-zone width/height to ≥0", () => {
    const tiny = { ...autoGrid("g", 320, 200), width: 8, height: 8 };
    const spec = getContainerSpec(tiny)!;
    expect(spec.dropZone.width).toBe(0);
    expect(spec.dropZone.height).toBe(0);
  });
});
