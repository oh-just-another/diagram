import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyScene, type Scene } from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { LASER_TRAIL_TTL_MS } from "../src/constants.js";
import {
  beginLaserStroke,
  extendLaserStroke,
  pruneLaserStrokes,
} from "../src/editor/public/laser.js";

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
    editor.setMode("laser");

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
    editor.setMode("laser");
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
    editor.setMode("laser");
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
});
