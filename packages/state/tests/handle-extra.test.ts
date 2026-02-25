/**
 * Extra resizeBounds coverage — the existing handle.test.ts covers nw/n/ne/e/se;
 * these fill in sw, w, s, and the n/ne variants with different axis emphasis.
 */
import { describe, expect, it } from "vitest";
import { resizeBounds } from "../src/handle.js";

const bounds = { x: 0, y: 0, width: 100, height: 50 };

describe("resizeBounds — missing handle variants", () => {
  it("sw shifts x, shrinks width, grows height", () => {
    const r = resizeBounds(bounds, "sw", { x: 10, y: 5 });
    expect(r).toEqual({ x: 10, y: 0, width: 90, height: 55 });
  });

  it("w shifts x and shrinks width only", () => {
    const r = resizeBounds(bounds, "w", { x: 15, y: 999 });
    expect(r.x).toBe(15);
    expect(r.width).toBe(85);
    expect(r.y).toBe(0);
    expect(r.height).toBe(50);
  });

  it("s grows height only (x/y/width unchanged)", () => {
    const r = resizeBounds(bounds, "s", { x: 999, y: 20 });
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(100);
    expect(r.height).toBe(70);
  });

  it("n shifts y and shrinks height", () => {
    const r = resizeBounds(bounds, "n", { x: 999, y: 10 });
    expect(r.x).toBe(0);
    expect(r.y).toBe(10);
    expect(r.width).toBe(100);
    expect(r.height).toBe(40);
  });

  it("ne shifts y + grows width + shrinks height", () => {
    const r = resizeBounds(bounds, "ne", { x: 20, y: 5 });
    expect(r).toEqual({ x: 0, y: 5, width: 120, height: 45 });
  });

  it("negative deltas reverse direction correctly (sw negative)", () => {
    const r = resizeBounds(bounds, "sw", { x: -10, y: -5 });
    expect(r).toEqual({ x: -10, y: 0, width: 110, height: 45 });
  });
});
