import { describe, expect, it } from "vitest";
import { shapeId } from "@oh-just-another/types";
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
  id: shapeId(id),
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
    expect(hit?.id).toBe(shapeId("c2"));
  });

  it("findContainerAt respects exclude set", () => {
    let scene = emptyScene();
    ({ scene } = addShape(scene, container("c1", 0, 0)));
    const exclude = new Set([shapeId("c1")]);
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
});
