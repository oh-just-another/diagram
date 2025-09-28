import { describe, expect, it } from "vitest";
import { linkId, layerId } from "@oh-just-another/types";
import { orderBetween, type Link } from "@oh-just-another/scene";
import { InMemoryLinkBitmapCache } from "../src/edge-cache-bitmap";

const edge = (id: string): Link =>
  ({
    id: linkId(id),
    layerId: layerId("default"),
    order: orderBetween(null, null),
    from: { kind: "anchor", elementId: { __brand: "shape" } as never, anchor: { kind: "named", name: "center" } },
    to: { kind: "anchor", elementId: { __brand: "shape" } as never, anchor: { kind: "named", name: "center" } },
    style: {},
  }) as Link;

describe("InMemoryLinkBitmapCache", () => {
  it("get returns undefined for a missing key", () => {
    const c = new InMemoryLinkBitmapCache<string>();
    expect(c.get(edge("e1"), 1)).toBeUndefined();
  });

  it("set then get returns the value", () => {
    const c = new InMemoryLinkBitmapCache<string>();
    const e = edge("e1");
    c.set(e, 1, "bitmap-a");
    expect(c.get(e, 1)).toBe("bitmap-a");
  });

  it("stale reference is treated as a miss + evicted", () => {
    const c = new InMemoryLinkBitmapCache<string>();
    const a = edge("e1");
    c.set(a, 1, "first");
    const aPrime = edge("e1"); // same id, fresh reference
    expect(c.get(aPrime, 1)).toBeUndefined();
    expect(c.size).toBe(0);
  });

  it("different zoom buckets are independent", () => {
    const c = new InMemoryLinkBitmapCache<string>();
    const e = edge("e1");
    c.set(e, 1, "@1");
    c.set(e, 2, "@2");
    expect(c.get(e, 1)).toBe("@1");
    expect(c.get(e, 2)).toBe("@2");
  });

  it("LRU evicts the oldest when cap is exceeded", () => {
    const c = new InMemoryLinkBitmapCache<string>(2);
    const a = edge("a");
    const b = edge("b");
    const ccc = edge("c");
    c.set(a, 1, "A");
    c.set(b, 1, "B");
    c.set(ccc, 1, "C"); // evicts "A"
    expect(c.get(a, 1)).toBeUndefined();
    expect(c.get(b, 1)).toBe("B");
    expect(c.get(ccc, 1)).toBe("C");
  });

  it("get refreshes the LRU order", () => {
    const c = new InMemoryLinkBitmapCache<string>(2);
    const a = edge("a");
    const b = edge("b");
    c.set(a, 1, "A");
    c.set(b, 1, "B");
    // Touch A → makes B the oldest.
    expect(c.get(a, 1)).toBe("A");
    const ccc = edge("c");
    c.set(ccc, 1, "C"); // evicts B, not A
    expect(c.get(a, 1)).toBe("A");
    expect(c.get(b, 1)).toBeUndefined();
  });

  it("clear empties the cache", () => {
    const c = new InMemoryLinkBitmapCache<string>();
    c.set(edge("a"), 1, "x");
    c.clear();
    expect(c.size).toBe(0);
  });
});
