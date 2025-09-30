import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import { InMemoryTileCache, type TileCacheEntry } from "../src/tile-renderer";

const entry = (
  col: number,
  row: number,
  zoom: number,
  shapes: readonly string[] = [],
  bytes = 1024,
): TileCacheEntry<string> => ({
  key: { col, row, zoom },
  bitmap: `tile-${col},${row}@${zoom}`,
  bounds: { x: col * 100, y: row * 100, width: 100, height: 100 },
  bytes,
  shapes: shapes.map((s) => elementId(s)),
});

describe("InMemoryTileCache invalidation", () => {
  it("invalidateRect drops every tile intersecting the rect", () => {
    const c = new InMemoryTileCache<string>();
    c.set(entry(0, 0, 1)); // 0..100, 0..100
    c.set(entry(1, 0, 1)); // 100..200, 0..100
    c.set(entry(5, 0, 1)); // 500..600, 0..100

    // Rect over the first two tiles, disjoint from the third.
    c.invalidateRect({ x: 50, y: 0, width: 100, height: 50 });
    expect(c.get({ col: 0, row: 0, zoom: 1 })).toBeUndefined();
    expect(c.get({ col: 1, row: 0, zoom: 1 })).toBeUndefined();
    expect(c.get({ col: 5, row: 0, zoom: 1 })).toBeDefined();
  });

  it("invalidateRect updates bytesUsed for evicted tiles", () => {
    const c = new InMemoryTileCache<string>();
    c.set(entry(0, 0, 1, [], 2_000));
    c.set(entry(5, 0, 1, [], 3_000));
    expect(c.bytesUsed).toBe(5_000);
    c.invalidateRect({ x: 0, y: 0, width: 100, height: 100 });
    expect(c.bytesUsed).toBe(3_000);
  });

  it("invalidateForPatch with removedElementId calls invalidateForElement", () => {
    const c = new InMemoryTileCache<string>();
    c.set(entry(0, 0, 1, ["a"]));
    c.set(entry(1, 0, 1, ["b"]));
    c.invalidateForPatch({ removedElementId: elementId("a") });
    expect(c.get({ col: 0, row: 0, zoom: 1 })).toBeUndefined();
    expect(c.get({ col: 1, row: 0, zoom: 1 })).toBeDefined();
  });

  it("invalidateForPatch with before+after bounds drops both regions", () => {
    const c = new InMemoryTileCache<string>();
    c.set(entry(0, 0, 1)); // old location
    c.set(entry(5, 0, 1)); // new location
    c.set(entry(10, 0, 1)); // untouched far away
    c.invalidateForPatch({
      beforeBounds: { x: 0, y: 0, width: 50, height: 50 },
      afterBounds: { x: 500, y: 0, width: 50, height: 50 },
    });
    expect(c.get({ col: 0, row: 0, zoom: 1 })).toBeUndefined();
    expect(c.get({ col: 5, row: 0, zoom: 1 })).toBeUndefined();
    expect(c.get({ col: 10, row: 0, zoom: 1 })).toBeDefined();
  });

  it("invalidateRect is a no-op when the rect is disjoint from every tile", () => {
    const c = new InMemoryTileCache<string>();
    c.set(entry(0, 0, 1, [], 100));
    c.invalidateRect({ x: 1000, y: 1000, width: 10, height: 10 });
    expect(c.get({ col: 0, row: 0, zoom: 1 })).toBeDefined();
    expect(c.bytesUsed).toBe(100);
  });
});
