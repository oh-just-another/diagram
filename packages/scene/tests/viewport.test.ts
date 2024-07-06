import { describe, expect, it } from "vitest";
import { matrix } from "@oh-just-another/math";
import {
  DEFAULT_VIEWPORT,
  getScreenToWorld,
  getWorldToScreen,
  panBy,
  resize,
  zoomAt,
} from "../src/index";

const close = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) < eps;

describe("viewport", () => {
  describe("transforms", () => {
    it("identity viewport leaves points unchanged", () => {
      const t = getWorldToScreen(DEFAULT_VIEWPORT);
      const p = matrix.applyToPoint(t, { x: 5, y: 7 });
      expect(close(p.x, 5)).toBe(true);
      expect(close(p.y, 7)).toBe(true);
    });
    it("worldToScreen ∘ screenToWorld = identity", () => {
      const vp = { ...DEFAULT_VIEWPORT, pan: { x: 10, y: 20 }, zoom: 2, rotation: 0.3 };
      const w2s = getWorldToScreen(vp);
      const s2w = getScreenToWorld(vp);
      const round = matrix.multiply(s2w, w2s);
      expect(matrix.equals(round, matrix.IDENTITY, 1e-9)).toBe(true);
    });
  });

  describe("panBy", () => {
    it("pans by screen-space delta scaled by zoom", () => {
      const vp = { ...DEFAULT_VIEWPORT, zoom: 2 };
      const out = panBy(vp, { x: 10, y: 4 });
      // 10 screen-px at zoom 2 = 5 world-units, subtracted from pan.
      expect(out.pan).toEqual({ x: -5, y: -2 });
    });
  });

  describe("zoomAt", () => {
    it("anchor point stays under the same screen pixel after zoom", () => {
      const vp = { ...DEFAULT_VIEWPORT, pan: { x: 0, y: 0 }, zoom: 1 };
      const anchor = { x: 100, y: 50 };
      const before = matrix.applyToPoint(getWorldToScreen(vp), anchor);
      const zoomed = zoomAt(vp, 2, anchor);
      const after = matrix.applyToPoint(getWorldToScreen(zoomed), anchor);
      expect(close(before.x, after.x, 1e-9)).toBe(true);
      expect(close(before.y, after.y, 1e-9)).toBe(true);
      expect(zoomed.zoom).toBe(2);
    });
  });

  describe("resize", () => {
    it("updates size only", () => {
      const out = resize(DEFAULT_VIEWPORT, 800, 600);
      expect(out.size).toEqual({ width: 800, height: 600 });
      expect(out.pan).toEqual(DEFAULT_VIEWPORT.pan);
      expect(out.zoom).toBe(DEFAULT_VIEWPORT.zoom);
    });
  });
});
