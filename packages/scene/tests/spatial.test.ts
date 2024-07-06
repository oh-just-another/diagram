import { describe, expect, it } from "vitest";
import { shapeId } from "@oh-just-another/types";
import { SpatialGrid } from "../src/index";

describe("SpatialGrid", () => {
  it("inserts and queries within a single cell", () => {
    const g = new SpatialGrid(100);
    g.insert(shapeId("a"), { x: 10, y: 10, width: 20, height: 20 });
    const result = g.query({ x: 0, y: 0, width: 50, height: 50 });
    expect(result.has(shapeId("a"))).toBe(true);
  });

  it("queries across multiple cells", () => {
    const g = new SpatialGrid(100);
    g.insert(shapeId("a"), { x: 50, y: 50, width: 200, height: 200 });
    // Query a far cell — should not include 'a'
    expect(g.query({ x: 1000, y: 1000, width: 10, height: 10 }).has(shapeId("a"))).toBe(false);
    // Query an overlapping cell
    expect(g.query({ x: 150, y: 150, width: 10, height: 10 }).has(shapeId("a"))).toBe(true);
  });

  it("update relocates a shape", () => {
    const g = new SpatialGrid(100);
    g.insert(shapeId("a"), { x: 10, y: 10, width: 10, height: 10 });
    g.update(shapeId("a"), { x: 500, y: 500, width: 10, height: 10 });
    expect(g.query({ x: 0, y: 0, width: 50, height: 50 }).size).toBe(0);
    expect(g.query({ x: 490, y: 490, width: 50, height: 50 }).has(shapeId("a"))).toBe(true);
  });

  it("remove deletes from all overlapped cells", () => {
    const g = new SpatialGrid(50);
    g.insert(shapeId("a"), { x: 0, y: 0, width: 200, height: 200 });
    g.remove(shapeId("a"));
    expect(g.query({ x: 0, y: 0, width: 300, height: 300 }).size).toBe(0);
    expect(g.size).toBe(0);
  });

  it("rejects duplicate insert", () => {
    const g = new SpatialGrid();
    g.insert(shapeId("a"), { x: 0, y: 0, width: 10, height: 10 });
    expect(() => g.insert(shapeId("a"), { x: 0, y: 0, width: 10, height: 10 })).toThrow(
      /already indexed/i,
    );
  });

  it("rejects non-positive cell size", () => {
    expect(() => new SpatialGrid(0)).toThrow();
    expect(() => new SpatialGrid(-1)).toThrow();
  });

  it("clear drops everything", () => {
    const g = new SpatialGrid();
    g.insert(shapeId("a"), { x: 0, y: 0, width: 10, height: 10 });
    g.clear();
    expect(g.size).toBe(0);
  });
});
