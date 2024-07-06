import { describe, expect, it } from "vitest";
import * as hitTest from "../src/hit-test";

describe("hit-test", () => {
  describe("pointInRect", () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    it("contains interior, boundary, rejects exterior", () => {
      expect(hitTest.pointInRect({ x: 5, y: 5 }, rect)).toBe(true);
      expect(hitTest.pointInRect({ x: 0, y: 0 }, rect)).toBe(true);
      expect(hitTest.pointInRect({ x: 10, y: 10 }, rect)).toBe(true);
      expect(hitTest.pointInRect({ x: -1, y: 5 }, rect)).toBe(false);
      expect(hitTest.pointInRect({ x: 11, y: 5 }, rect)).toBe(false);
    });
  });

  describe("pointInPolygon", () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];
    it("interior point is inside", () => {
      expect(hitTest.pointInPolygon({ x: 5, y: 5 }, triangle)).toBe(true);
    });
    it("clearly exterior point is outside", () => {
      expect(hitTest.pointInPolygon({ x: 100, y: 100 }, triangle)).toBe(false);
    });
    it("centroid is inside", () => {
      expect(hitTest.pointInPolygon({ x: 5, y: 3 }, triangle)).toBe(true);
    });
    it("polygons with fewer than 3 points are never hit", () => {
      expect(hitTest.pointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
      expect(hitTest.pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toBe(false);
      expect(
        hitTest.pointInPolygon({ x: 0, y: 0 }, [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ]),
      ).toBe(false);
    });
    it("concave polygon (arrowhead) correctly excludes the notch", () => {
      const arrow = [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 0, y: 10 },
        { x: 5, y: 5 },
      ];
      expect(hitTest.pointInPolygon({ x: 2, y: 5 }, arrow)).toBe(false);
      expect(hitTest.pointInPolygon({ x: 6, y: 5 }, arrow)).toBe(true);
    });
  });

  describe("distanceToSegment / pointOnSegment", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    it("distance from point on segment is 0", () => {
      expect(hitTest.distanceToSegment({ x: 5, y: 0 }, a, b)).toBe(0);
    });
    it("distance from point off perpendicular is perpendicular distance", () => {
      expect(hitTest.distanceToSegment({ x: 5, y: 4 }, a, b)).toBe(4);
    });
    it("distance from point past endpoint is distance to endpoint", () => {
      expect(hitTest.distanceToSegment({ x: 15, y: 0 }, a, b)).toBe(5);
      expect(hitTest.distanceToSegment({ x: -3, y: 4 }, a, b)).toBe(5);
    });
    it("degenerate segment falls back to point distance", () => {
      expect(hitTest.distanceToSegment({ x: 3, y: 4 }, a, a)).toBe(5);
    });
    it("pointOnSegment respects tolerance", () => {
      expect(hitTest.pointOnSegment({ x: 5, y: 0.5 }, a, b, 1)).toBe(true);
      expect(hitTest.pointOnSegment({ x: 5, y: 2 }, a, b, 1)).toBe(false);
    });
  });

  describe("pointOnPolyline", () => {
    const polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    it("returns true near any segment", () => {
      expect(hitTest.pointOnPolyline({ x: 5, y: 0.5 }, polyline, 1)).toBe(true);
      expect(hitTest.pointOnPolyline({ x: 10.5, y: 5 }, polyline, 1)).toBe(true);
    });
    it("returns false away from all segments", () => {
      expect(hitTest.pointOnPolyline({ x: 5, y: 5 }, polyline, 1)).toBe(false);
    });
  });
});
