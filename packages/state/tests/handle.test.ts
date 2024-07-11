import { describe, expect, it } from "vitest";
import { ALL_HANDLES, HANDLE_SIZE, handlePosition, hitHandle, resizeBounds } from "../src/handle";

const bounds = { x: 0, y: 0, width: 100, height: 50 };

describe("handle positions", () => {
  it("nw is top-left, se is bottom-right", () => {
    expect(handlePosition("nw", bounds)).toEqual({ x: 0, y: 0 });
    expect(handlePosition("se", bounds)).toEqual({ x: 100, y: 50 });
  });
  it("n / s / e / w are midpoints", () => {
    expect(handlePosition("n", bounds)).toEqual({ x: 50, y: 0 });
    expect(handlePosition("s", bounds)).toEqual({ x: 50, y: 50 });
    expect(handlePosition("e", bounds)).toEqual({ x: 100, y: 25 });
    expect(handlePosition("w", bounds)).toEqual({ x: 0, y: 25 });
  });
  it("ALL_HANDLES has 8 unique entries", () => {
    expect(new Set(ALL_HANDLES).size).toBe(8);
  });
});

describe("hitHandle", () => {
  it("hits the handle within HANDLE_SIZE tolerance at zoom=1", () => {
    expect(hitHandle({ x: 1, y: 1 }, bounds, 1)).toBe("nw");
    expect(hitHandle({ x: HANDLE_SIZE, y: HANDLE_SIZE }, bounds, 1)).toBe("nw");
  });
  it("misses when too far", () => {
    expect(hitHandle({ x: 50, y: 25 }, bounds, 1)).toBeNull();
  });
  it("compensates for zoom: handle stays the same screen size", () => {
    // At zoom 4, world tolerance shrinks to HANDLE_SIZE / 4 = 1.
    expect(hitHandle({ x: 3, y: 0 }, bounds, 4)).toBeNull();
    expect(hitHandle({ x: 0.5, y: 0 }, bounds, 4)).toBe("nw");
  });
});

describe("resizeBounds", () => {
  it("se grows in +x +y", () => {
    expect(resizeBounds(bounds, "se", { x: 10, y: 5 })).toEqual({
      x: 0,
      y: 0,
      width: 110,
      height: 55,
    });
  });
  it("nw shifts origin and shrinks size", () => {
    expect(resizeBounds(bounds, "nw", { x: 5, y: 10 })).toEqual({
      x: 5,
      y: 10,
      width: 95,
      height: 40,
    });
  });
  it("e changes only width", () => {
    const r = resizeBounds(bounds, "e", { x: 7, y: 99 });
    expect(r.width).toBe(107);
    expect(r.height).toBe(50);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });
});
