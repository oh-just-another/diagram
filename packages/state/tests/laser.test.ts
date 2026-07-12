import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { req } from "@oh-just-another/types";
import { emptyScene, type Scene } from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { LASER_TRAIL_TTL_MS } from "../src/constants.js";
import {
  beginLaserStroke,
  extendLaserStroke,
  pruneLaserStrokes,
  smoothLaserPoints,
} from "../src/editor/public/laser.js";

/**
 * Recording render target — counts the `lineTo` calls so a test can assert the
 * overlay actually stroked the laser trail this frame. Every other method is a
 * no-op. A fresh instance per test keeps the module-level overlay memo (keyed on
 * the target) from bleeding between cases.
 */
const makeRecordingTarget = (): { target: never; lineToCount: () => number } => {
  let lineTos = 0;
  const target = {
    ...(noopTarget as object),
    lineTo: () => {
      lineTos += 1;
    },
  } as never;
  return { target, lineToCount: () => lineTos };
};

const makeEditorWithOverlay = (scene: Scene, overlayTarget: never): Editor =>
  new Editor({
    host: {
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
      style: {},
    } as never,
    mainTarget: noopTarget,
    overlayTarget,
    initialScene: scene,
  });

const noopTarget = {
  save: () => {},
  restore: () => {},
  setTransform: () => {},
  clear: () => {},
  setFill: () => {},
  setStroke: () => {},
  setStrokeWidth: () => {},
  setOpacity: () => {},
  setLineCap: () => {},
  setLineJoin: () => {},
  setDashArray: () => {},
  setFont: () => {},
  setTextAlign: () => {},
  setTextBaseline: () => {},
  beginPath: () => {},
  closePath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  bezierCurveTo: () => {},
  quadraticCurveTo: () => {},
  rect: () => {},
  ellipse: () => {},
  fill: () => {},
  stroke: () => {},
  fillText: () => {},
  measureText: () => ({ width: 0 }),
  drawImage: () => {},
  drawPoint: () => {},
  scale: () => {},
  translate: () => {},
  rotate: () => {},
} as never;

const makeEditor = (scene: Scene): Editor =>
  new Editor({
    host: {
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
      style: {},
    } as never,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

describe("laser stroke (pure)", () => {
  it("prunes points past the TTL and drops empty strokes", () => {
    const t0 = 1000;
    const stroke = beginLaserStroke({ x: 0, y: 0 }, t0);
    extendLaserStroke(stroke, { x: 10, y: 0 }, t0 + 100);

    // Nothing expired yet → same reference, unchanged.
    const still = pruneLaserStrokes([stroke], t0 + 200);
    expect(still.changed).toBe(false);
    expect(still.strokes[0]?.points.length).toBe(2);

    // The first point ages out, the second survives.
    const half = pruneLaserStrokes([stroke], t0 + LASER_TRAIL_TTL_MS + 50);
    expect(half.changed).toBe(true);
    expect(half.strokes[0]?.points.length).toBe(1);

    // Everything ages out → the stroke is removed entirely.
    const gone = pruneLaserStrokes([stroke], t0 + LASER_TRAIL_TTL_MS + 200);
    expect(gone.changed).toBe(true);
    expect(gone.strokes.length).toBe(0);
  });
});

describe("laser tool (editor)", () => {
  // The editor stamps points with `performance.now()`; drive it deterministically.
  let clock = 0;
  beforeEach(() => {
    clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records an ephemeral trail without mutating scene or history", () => {
    const editor = makeEditor(emptyScene());
    editor.setActiveTool("laser");

    editor.beginLaserStroke({ x: 0, y: 0 });
    editor.extendLaserStroke({ x: 10, y: 10 });
    editor.extendLaserStroke({ x: 20, y: 20 });

    // A trail exists in ephemeral state …
    expect(editor.laserStrokes.length).toBe(1);
    expect(editor.laserStrokes[0]?.points.length).toBe(3);
    expect(editor.hasActiveLaser()).toBe(true);
    // … but nothing entered the scene, and undo has nothing to do.
    expect(editor.scene.elements.size).toBe(0);
    expect(editor.canUndo).toBe(false);
  });

  it("stops appending after the gesture ends (hover moves are ignored)", () => {
    const editor = makeEditor(emptyScene());
    editor.setActiveTool("laser");
    editor.beginLaserStroke({ x: 0, y: 0 });
    editor.extendLaserStroke({ x: 5, y: 5 });
    editor.endLaserStroke();
    expect(editor.laserDrawing).toBe(false);
    // A stray extend after release must not grow the trail.
    editor.extendLaserStroke({ x: 999, y: 999 });
    expect(editor.laserStrokes[0]?.points.length).toBe(2);
  });

  it("expires the trail over time and leaves the scene untouched", () => {
    const editor = makeEditor(emptyScene());
    editor.setActiveTool("laser");
    editor.beginLaserStroke({ x: 0, y: 0 });
    editor.extendLaserStroke({ x: 5, y: 5 });
    editor.endLaserStroke();
    expect(editor.hasActiveLaser()).toBe(true);

    // Advance well past the TTL, then force a render so pruning runs.
    clock = LASER_TRAIL_TTL_MS + 500;
    editor.forceRender();
    expect(editor.hasActiveLaser()).toBe(false);
    expect(editor.scene.elements.size).toBe(0);
    expect(editor.canUndo).toBe(false);
  });

  it("paints the trail immediately on move, not seconds later (FT4)", () => {
    const { target, lineToCount } = makeRecordingTarget();
    const editor = makeEditorWithOverlay(emptyScene(), target);
    editor.setActiveTool("laser");

    // Seed the overlay memo while no trail exists (mirrors an idle frame before
    // the gesture). This is what used to hide the trail: the memo cached an
    // options bag without laser, and an in-place push left the signature — the
    // `laserStrokes` array reference — unchanged, so the memo never rebuilt.
    editor.forceRender();
    expect(lineToCount()).toBe(0);

    editor.beginLaserStroke({ x: 0, y: 0 });
    editor.extendLaserStroke({ x: 40, y: 10 });
    editor.extendLaserStroke({ x: 80, y: 0 });

    // A render RIGHT NOW (no time advanced, no prune) must already stroke the
    // trail. Before the fix the memo was reused and nothing was drawn until a
    // prune (~TTL later) reallocated the array.
    const before = lineToCount();
    editor.forceRender();
    expect(lineToCount()).toBeGreaterThan(before);
  });

  it("requests a render on every laser move (scheduleRender via notify)", () => {
    const editor = makeEditor(emptyScene());
    editor.setActiveTool("laser");
    editor.beginLaserStroke({ x: 0, y: 0 });

    const before = editor.laserStrokes;
    editor.extendLaserStroke({ x: 10, y: 10 });
    // A move must yield a FRESH strokes array reference so the render-overlay
    // memo (which compares by identity) rebuilds and repaints this frame.
    expect(editor.laserStrokes).not.toBe(before);
    expect(editor.laserStrokes[0]?.points.length).toBe(2);
  });
});

describe("laser trail smoothing (FT5)", () => {
  it("resamples a sparse polyline into a denser smooth curve", () => {
    const raw = [
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 20, t: 100 },
      { x: 20, y: 0, t: 200 },
      { x: 30, y: 20, t: 300 },
    ];
    const smooth = smoothLaserPoints(raw);
    // More points than the raw capture → visibly smoother than the polyline.
    expect(smooth.length).toBeGreaterThan(raw.length);
    // Passes through the first captured point (curve interpolates its knots).
    expect(smooth[0]).toEqual({ x: 0, y: 0, t: 0 });
    // Ends at the last captured point.
    const last = smooth[smooth.length - 1];
    expect(last?.x).toBeCloseTo(30);
    expect(last?.y).toBeCloseTo(20);
  });

  it("keeps birth timestamps monotonic so the TTL fade stays tail-first", () => {
    const raw = [
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 10, t: 100 },
      { x: 20, y: 0, t: 200 },
    ];
    const smooth = smoothLaserPoints(raw);
    for (let i = 1; i < smooth.length; i++) {
      expect(req(smooth[i]).t).toBeGreaterThanOrEqual(req(smooth[i - 1]).t);
    }
    // Interpolated timestamps stay within the captured range.
    expect(req(smooth[smooth.length - 1]).t).toBeCloseTo(200);
  });

  it("passes short trails (< 3 points) through unchanged", () => {
    const one = [{ x: 1, y: 2, t: 5 }];
    expect(smoothLaserPoints(one)).toBe(one);
    const two = [
      { x: 0, y: 0, t: 0 },
      { x: 5, y: 5, t: 50 },
    ];
    expect(smoothLaserPoints(two)).toBe(two);
  });
});
