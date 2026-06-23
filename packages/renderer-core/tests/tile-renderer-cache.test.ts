import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import { InMemoryTileCache, type TileCacheEntry } from "../src/tile-renderer";

const entry = (
  col: number,
  row: number,
  zoom: number,
  elements: readonly string[] = [],
  bytes = 1024,
): TileCacheEntry<string> => ({
  key: { col, row, zoom },
  bitmap: `tile-${col},${row}@${zoom}`,
  bounds: { x: col * 100, y: row * 100, width: 100, height: 100 },
  bytes,
  elements: elements.map((s) => elementId(s)),
});

describe("InMemoryTileCache.get / set", () => {
  it("get returns undefined for a missing key", () => {
    const c = new InMemoryTileCache<string>();
    expect(c.get({ col: 9, row: 9, zoom: 1 })).toBeUndefined();
  });

  it("get re-inserts the entry at the tail (LRU touch) without losing it", () => {
    const c = new InMemoryTileCache<string>();
    c.set(entry(0, 0, 1, [], 100));
    c.set(entry(1, 0, 1, [], 100));
    // Touch tile 0 so it becomes most-recently-used.
    expect(c.get({ col: 0, row: 0, zoom: 1 })?.bitmap).toBe("tile-0,0@1");
    expect(c.bytesUsed).toBe(200);
  });

  it("set over an existing key replaces it: bytes & reverse index updated", () => {
    const c = new InMemoryTileCache<string>();
    c.set(entry(0, 0, 1, ["a"], 1000));
    expect(c.bytesUsed).toBe(1000);
    // Re-set the same tile key with new bytes + a different element set.
    c.set(entry(0, 0, 1, ["b"], 300));
    expect(c.bytesUsed).toBe(300); // prior 1000 subtracted, 300 added
    // The old element "a" no longer points at the tile.
    c.invalidateForElement(elementId("a"));
    expect(c.get({ col: 0, row: 0, zoom: 1 })).toBeDefined();
    // The new element "b" does.
    c.invalidateForElement(elementId("b"));
    expect(c.get({ col: 0, row: 0, zoom: 1 })).toBeUndefined();
  });
});

describe("InMemoryTileCache.invalidateForElement", () => {
  it("is a no-op when the element has no tiles", () => {
    const c = new InMemoryTileCache<string>();
    c.set(entry(0, 0, 1, ["a"], 100));
    c.invalidateForElement(elementId("never-cached"));
    expect(c.bytesUsed).toBe(100);
  });

  it("drops every tile holding the element and unlinks co-tenant elements", () => {
    const c = new InMemoryTileCache<string>();
    // Tile holds both "a" and "b"; invalidating "a" must also unlink "b".
    c.set(entry(0, 0, 1, ["a", "b"], 500));
    c.set(entry(1, 0, 1, ["a"], 500));
    c.invalidateForElement(elementId("a"));
    expect(c.bytesUsed).toBe(0);
    // "b"'s reverse-index entry was cleaned; invalidating it is a harmless no-op.
    c.invalidateForElement(elementId("b"));
    expect(c.bytesUsed).toBe(0);
  });
});

describe("InMemoryTileCache eviction", () => {
  it("evicts oldest tiles when the cap is exceeded on set", () => {
    const c = new InMemoryTileCache<string>(1000);
    c.set(entry(0, 0, 1, ["a"], 600)); // oldest
    c.set(entry(1, 0, 1, ["b"], 600)); // pushes total to 1200 > cap → evict tile 0
    expect(c.bytesUsed).toBeLessThanOrEqual(1000);
    expect(c.get({ col: 0, row: 0, zoom: 1 })).toBeUndefined(); // oldest gone
    expect(c.get({ col: 1, row: 0, zoom: 1 })).toBeDefined();
  });

  it("does not evict when under cap (early return arm)", () => {
    const c = new InMemoryTileCache<string>(10_000);
    c.set(entry(0, 0, 1, [], 500));
    c.set(entry(1, 0, 1, [], 500));
    expect(c.bytesUsed).toBe(1000);
    expect(c.get({ col: 0, row: 0, zoom: 1 })).toBeDefined();
  });
});

describe("InMemoryTileCache.invalidateForPatch", () => {
  it("does nothing when no options are supplied", () => {
    const c = new InMemoryTileCache<string>();
    c.set(entry(0, 0, 1, ["a"], 100));
    c.invalidateForPatch({});
    expect(c.bytesUsed).toBe(100);
  });
});

describe("InMemoryTileCache.clear", () => {
  it("drops all entries, reverse index and byte count", () => {
    const c = new InMemoryTileCache<string>();
    c.set(entry(0, 0, 1, ["a"], 100));
    c.set(entry(1, 0, 1, ["b"], 100));
    c.clear();
    expect(c.bytesUsed).toBe(0);
    expect(c.get({ col: 0, row: 0, zoom: 1 })).toBeUndefined();
  });
});
