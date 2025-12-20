import { describe, expect, it } from "vitest";
import { elementId, layerId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  HEADING_DOWN,
  HEADING_LEFT,
  HEADING_RIGHT,
  HEADING_UP,
  flipHeading,
  headingForEdgePoint,
  headingForPoint,
  headingForPointFromElement,
  headingIsHorizontal,
  orderBetween,
  vectorToHeading,
  type RectangleElement,
} from "../src/index";

const rect = (x: number, y: number, w: number, h: number): RectangleElement => ({
  id: elementId("r"),
  layerId: layerId(DEFAULT_LAYER_ID),
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: w,
  height: h,
});

describe("heading", () => {
  it("vectorToHeading quantises to the dominant axis", () => {
    expect(vectorToHeading({ x: 10, y: 1 })).toEqual(HEADING_RIGHT);
    expect(vectorToHeading({ x: -10, y: 1 })).toEqual(HEADING_LEFT);
    expect(vectorToHeading({ x: 1, y: 10 })).toEqual(HEADING_DOWN);
    expect(vectorToHeading({ x: 1, y: -10 })).toEqual(HEADING_UP);
  });

  it("headingForPoint is relative to the origin", () => {
    expect(headingForPoint({ x: 100, y: 0 }, { x: 0, y: 0 })).toEqual(HEADING_RIGHT);
    expect(headingForPoint({ x: 0, y: -100 }, { x: 0, y: 0 })).toEqual(HEADING_UP);
  });

  it("headingIsHorizontal / flipHeading", () => {
    expect(headingIsHorizontal(HEADING_RIGHT)).toBe(true);
    expect(headingIsHorizontal(HEADING_DOWN)).toBe(false);
    expect(flipHeading(HEADING_RIGHT)).toEqual(HEADING_LEFT);
    expect(flipHeading(HEADING_UP)).toEqual(HEADING_DOWN);
  });

  it("headingForPointFromElement picks the exit side via the AABB cones", () => {
    // 100×60 rect at origin → centre (50, 30).
    const r = rect(0, 0, 100, 60);
    expect(headingForPointFromElement(r, { x: 200, y: 30 })).toEqual(HEADING_RIGHT);
    expect(headingForPointFromElement(r, { x: -50, y: 30 })).toEqual(HEADING_LEFT);
    expect(headingForPointFromElement(r, { x: 50, y: 200 })).toEqual(HEADING_DOWN);
    expect(headingForPointFromElement(r, { x: 50, y: -50 })).toEqual(HEADING_UP);
  });

  it("cone test accounts for the box aspect ratio (wide box favours up/down sooner)", () => {
    // Very wide, short box: a point near a top corner should read as UP,
    // not LEFT/RIGHT, because the diagonals are shallow.
    const wide = rect(0, 0, 400, 40); // centre (200, 20)
    expect(headingForPointFromElement(wide, { x: 230, y: -100 })).toEqual(HEADING_UP);
  });

  it("headingForEdgePoint returns the outward normal of the NEAREST edge", () => {
    const r = rect(0, 0, 100, 60); // edges: x=0 (left), x=100 (right), y=0 (top), y=60 (bottom)
    expect(headingForEdgePoint(r, { x: 100, y: 30 })).toEqual(HEADING_RIGHT); // on right edge
    expect(headingForEdgePoint(r, { x: 0, y: 30 })).toEqual(HEADING_LEFT);
    expect(headingForEdgePoint(r, { x: 50, y: 0 })).toEqual(HEADING_UP);
    expect(headingForEdgePoint(r, { x: 50, y: 60 })).toEqual(HEADING_DOWN);
    // Near the top-right corner but slightly closer to the RIGHT edge → RIGHT
    // (the cone test would tip to UP here, sending the dongle along the top).
    expect(headingForEdgePoint(r, { x: 98, y: 5 })).toEqual(HEADING_RIGHT);
  });
});
