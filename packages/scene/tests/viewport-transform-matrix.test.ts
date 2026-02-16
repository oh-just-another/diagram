import { describe, expect, it } from "vitest";
import { matrix } from "@oh-just-another/math";
import {
  DEFAULT_VIEWPORT,
  getScreenToWorld,
  getWorldToScreen,
  panBy,
  zoomAt,
  type Viewport,
} from "../src/index";

/**
 * Diverse coordinate-transform coverage. The hit-test maps screen→world via
 * `getScreenToWorld`; the renderer maps world→screen via `getWorldToScreen`.
 * These must be exact inverses so a tap resolves to where a shape is drawn.
 *
 * These are pure math, independent of DPR / canvas backend: DPR is absorbed
 * by the canvas drawing-buffer scale (`setupHiDpi`), never by this transform,
 * so screen coordinates here are always CSS pixels.
 */

const close = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps;

// A spread of cameras covering extreme zoom-out, 1×, and extreme zoom-in,
// off-origin pans (incl. negative), and several rotations.
const ZOOMS = [0.1, 0.25, 0.5, 1, 1.7, 2.5, 8, 40];
const PANS = [
  { x: 0, y: 0 },
  { x: 137, y: -42 },
  { x: -1000, y: 2000 },
  { x: 0.5, y: 0.5 },
];
const ROTATIONS = [0, Math.PI / 6, Math.PI / 2, -Math.PI / 3, Math.PI];

// Points to probe, including a viewport corner, far-off coords, sub-pixel.
const POINTS = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
  { x: 1920, y: 1080 },
  { x: -640, y: -360 },
  { x: 12345.678, y: -9876.543 },
  { x: 0.333, y: 0.667 },
];

const vp = (zoom: number, pan: { x: number; y: number }, rotation: number): Viewport => ({
  ...DEFAULT_VIEWPORT,
  zoom,
  pan,
  rotation,
  size: { width: 1280, height: 720 },
});

describe("viewport transform — diverse round-trips", () => {
  it("screenToWorld ∘ worldToScreen = identity across zoom × pan × rotation", () => {
    for (const zoom of ZOOMS) {
      for (const pan of PANS) {
        for (const rot of ROTATIONS) {
          const camera = vp(zoom, pan, rot);
          const w2s = getWorldToScreen(camera);
          const s2w = getScreenToWorld(camera);
          for (const p of POINTS) {
            const screen = matrix.applyToPoint(w2s, p);
            const back = matrix.applyToPoint(s2w, screen);
            // Tolerance scales a touch with magnitude / zoom so the big
            // coords at 40× don't trip float noise.
            const eps = 1e-6 * Math.max(1, Math.abs(p.x) + Math.abs(p.y));
            expect(
              close(back.x, p.x, eps) && close(back.y, p.y, eps),
              `zoom=${zoom} pan=${pan.x},${pan.y} rot=${rot} p=${p.x},${p.y} → ${back.x},${back.y}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("a tapped screen point maps to the world point drawn there (no offset)", () => {
    // Simulates: shape at world W is rendered at screen S; a tap at S must
    // resolve back to W.
    for (const zoom of ZOOMS) {
      for (const rot of ROTATIONS) {
        const camera = vp(zoom, { x: 50, y: -30 }, rot);
        const worldShape = { x: 300, y: 200 };
        const screen = matrix.applyToPoint(getWorldToScreen(camera), worldShape);
        const hit = matrix.applyToPoint(getScreenToWorld(camera), screen);
        expect(close(hit.x, worldShape.x, 1e-4)).toBe(true);
        expect(close(hit.y, worldShape.y, 1e-4)).toBe(true);
      }
    }
  });
});

describe("zoomAt — anchor invariance across factors and cameras", () => {
  it("the world anchor stays under the same screen pixel after zoom (any factor)", () => {
    const factors = [0.2, 0.5, 0.9, 1.1, 2, 5, 13];
    for (const zoom of ZOOMS) {
      for (const pan of PANS) {
        const camera = vp(zoom, pan, 0);
        const anchor = { x: 420, y: 137 };
        const before = matrix.applyToPoint(getWorldToScreen(camera), anchor);
        for (const f of factors) {
          const zoomed = zoomAt(camera, f, anchor);
          const after = matrix.applyToPoint(getWorldToScreen(zoomed), anchor);
          expect(close(before.x, after.x, 1e-4)).toBe(true);
          expect(close(before.y, after.y, 1e-4)).toBe(true);
          expect(close(zoomed.zoom, zoom * f, 1e-9)).toBe(true);
        }
      }
    }
  });
});

describe("panBy — screen delta moves world by delta/zoom", () => {
  it("one screen pixel of pan = 1/zoom world units, at every zoom", () => {
    for (const zoom of ZOOMS) {
      const camera = vp(zoom, { x: 0, y: 0 }, 0);
      const out = panBy(camera, { x: zoom, y: 2 * zoom });
      // delta/zoom subtracted from pan → exactly (1, 2) world units.
      expect(close(out.pan.x, -1, 1e-9)).toBe(true);
      expect(close(out.pan.y, -2, 1e-9)).toBe(true);
    }
  });
});
