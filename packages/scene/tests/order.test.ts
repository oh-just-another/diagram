import { describe, expect, it } from "vitest";
import { byOrderAsc, byOrderDesc, orderBetween } from "../src/index";
import type { FractionalIndex } from "fractional-keys";

/** A handful of distinct, monotonically increasing fractional indices. */
const makeOrders = (count: number): FractionalIndex[] => {
  const orders: FractionalIndex[] = [];
  let prev: FractionalIndex | null = null;
  for (let i = 0; i < count; i++) {
    const next = orderBetween(prev, null);
    orders.push(next);
    prev = next;
  }
  return orders;
};

describe("order comparators", () => {
  describe("byOrderAsc", () => {
    it("sorts an array ascending by order", () => {
      const [a, b, c] = makeOrders(3) as [FractionalIndex, FractionalIndex, FractionalIndex];
      const shuffled = [{ order: c }, { order: a }, { order: b }];
      const sorted = [...shuffled].sort(byOrderAsc);
      expect(sorted.map((s) => s.order)).toEqual([a, b, c]);
    });

    it("returns a negative number when a < b", () => {
      const [a, b] = makeOrders(2) as [FractionalIndex, FractionalIndex];
      expect(byOrderAsc({ order: a }, { order: b })).toBeLessThan(0);
    });

    it("returns a positive number when a > b", () => {
      const [a, b] = makeOrders(2) as [FractionalIndex, FractionalIndex];
      expect(byOrderAsc({ order: b }, { order: a })).toBeGreaterThan(0);
    });

    it("returns 0 for equal orders", () => {
      const [a] = makeOrders(1) as [FractionalIndex];
      expect(byOrderAsc({ order: a }, { order: a })).toBe(0);
    });
  });

  describe("byOrderDesc", () => {
    it("sorts an array descending by order", () => {
      const [a, b, c] = makeOrders(3) as [FractionalIndex, FractionalIndex, FractionalIndex];
      const shuffled = [{ order: a }, { order: c }, { order: b }];
      const sorted = [...shuffled].sort(byOrderDesc);
      expect(sorted.map((s) => s.order)).toEqual([c, b, a]);
    });

    it("returns 0 for equal orders", () => {
      const [a] = makeOrders(1) as [FractionalIndex];
      expect(byOrderDesc({ order: a }, { order: a })).toBe(0);
    });
  });

  describe("reverse relationship", () => {
    it("byOrderDesc(a, b) === byOrderAsc(b, a)", () => {
      const orders = makeOrders(2);
      const a = orders[0]!;
      const b = orders[1]!;
      expect(byOrderDesc({ order: a }, { order: b })).toBe(byOrderAsc({ order: b }, { order: a }));
      expect(byOrderDesc({ order: b }, { order: a })).toBe(byOrderAsc({ order: a }, { order: b }));
    });

    it("the two comparators produce reversed orderings", () => {
      const orders = makeOrders(4).map((order) => ({ order }));
      const asc = [...orders].sort(byOrderAsc);
      const desc = [...orders].sort(byOrderDesc);
      expect(desc).toEqual([...asc].reverse());
    });
  });
});
