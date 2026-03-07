import { describe, expect, it } from "vitest";
import { emptyScene } from "@oh-just-another/scene";
import type { Scene } from "@oh-just-another/scene";
import type { RenderTarget } from "../src/render-target.js";
import { renderGrid, type GridLevel } from "../src/grid-renderer.js";

// ---------------------------------------------------------------------------
// Recorder
// ---------------------------------------------------------------------------
const makeRecorder = (
  width = 800,
  height = 600,
): {
  target: RenderTarget;
  calls: { method: string; args: readonly unknown[] }[];
} => {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const handler: ProxyHandler<object> = {
    get: (_target, prop: string) => {
      if (prop === "size") return { width, height };
      if (prop === "then") return undefined;
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return undefined;
      };
    },
  };
  const target = new Proxy({}, handler) as unknown as RenderTarget;
  return { target, calls };
};

// ---------------------------------------------------------------------------
// Scene helpers
// ---------------------------------------------------------------------------
const sceneWithGrid = (
  gridSize: number,
  zoom = 1,
  gridStyle?: "lines" | "dots",
): Scene => {
  const base = emptyScene();
  return {
    ...base,
    viewport: {
      ...base.viewport,
      zoom,
      gridSize,
      ...(gridStyle !== undefined ? { gridStyle } : {}),
    },
  };
};

// A minimal single level that is fully opaque at zoom=1 (mid≤1).
const SINGLE_LEVEL: readonly GridLevel[] = [{ min: 0, mid: 0.5, step: 1 }];

// ---------------------------------------------------------------------------
// Tests: clear behaviour
// ---------------------------------------------------------------------------
describe("renderGrid – clear", () => {
  it("calls target.clear() by default", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(20);
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    expect(calls[0]).toMatchObject({ method: "clear" });
  });

  it("skips clear when skipClear=true", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(20);
    renderGrid(scene, target, { skipClear: true, levels: SINGLE_LEVEL });
    expect(calls.find((c) => c.method === "clear")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: no-draw early-exit conditions
// ---------------------------------------------------------------------------
describe("renderGrid – early exit when grid is off", () => {
  it("does nothing extra after clear when gridSize is 0", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(0);
    renderGrid(scene, target);
    // Only the initial clear() should be recorded.
    const meaningful = calls.filter((c) => c.method !== "clear");
    expect(meaningful).toHaveLength(0);
  });

  it("does nothing extra after clear when gridSize is undefined", () => {
    const { target, calls } = makeRecorder();
    const base = emptyScene();
    // viewport has no gridSize field → undefined
    renderGrid(base, target);
    const meaningful = calls.filter((c) => c.method !== "clear");
    expect(meaningful).toHaveLength(0);
  });

  it("does nothing extra when target size is 0×0", () => {
    const { target, calls } = makeRecorder(0, 0);
    const scene = sceneWithGrid(20);
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    const meaningful = calls.filter((c) => c.method !== "clear");
    expect(meaningful).toHaveLength(0);
  });

  it("does nothing extra when target width is 0", () => {
    const { target, calls } = makeRecorder(0, 600);
    const scene = sceneWithGrid(20);
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    const meaningful = calls.filter((c) => c.method !== "clear");
    expect(meaningful).toHaveLength(0);
  });

  it("does nothing extra when target height is 0", () => {
    const { target, calls } = makeRecorder(800, 0);
    const scene = sceneWithGrid(20);
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    const meaningful = calls.filter((c) => c.method !== "clear");
    expect(meaningful).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: save / restore bracket
// ---------------------------------------------------------------------------
describe("renderGrid – state stack", () => {
  it("wraps drawing in save / restore", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(20);
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    const saves = calls.filter((c) => c.method === "save").length;
    const restores = calls.filter((c) => c.method === "restore").length;
    expect(saves).toBe(1);
    expect(restores).toBe(1);
  });

  it("calls setTransform exactly once (world-to-screen)", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(20);
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    const setTransforms = calls.filter((c) => c.method === "setTransform");
    expect(setTransforms).toHaveLength(1);
  });

  it("resets opacity to 1 before restore", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(20);
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    const restoreIdx = calls.findIndex((c) => c.method === "restore");
    // The call immediately before restore should be setOpacity(1).
    const beforeRestore = calls[restoreIdx - 1];
    expect(beforeRestore).toMatchObject({ method: "setOpacity", args: [1] });
  });
});

// ---------------------------------------------------------------------------
// Tests: lines mode
// ---------------------------------------------------------------------------
describe("renderGrid – lines style", () => {
  it("calls setStroke with the grid colour", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(20, 1, "lines");
    renderGrid(scene, target, { color: "#aabbcc", levels: SINGLE_LEVEL });
    const strokeCalls = calls.filter((c) => c.method === "setStroke");
    expect(strokeCalls.length).toBeGreaterThan(0);
    expect(strokeCalls[0]!.args[0]).toBe("#aabbcc");
  });

  it("calls stroke() after beginPath for lines", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(20, 1, "lines");
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    expect(calls.some((c) => c.method === "stroke")).toBe(true);
    expect(calls.some((c) => c.method === "beginPath")).toBe(true);
  });

  it("does NOT call fill() in lines mode", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(20, 1, "lines");
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    expect(calls.find((c) => c.method === "fill")).toBeUndefined();
  });

  it("emits moveTo/lineTo pairs for vertical and horizontal lines", () => {
    const { target, calls } = makeRecorder(200, 200);
    // zoom=1, gridSize=100 → step=100, snapped to 100-unit grid
    // viewport world rect ≈ 200×200 at origin → ~3 vertical + ~3 horizontal lines
    const scene = sceneWithGrid(100, 1, "lines");
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    const moveTos = calls.filter((c) => c.method === "moveTo");
    const lineTos = calls.filter((c) => c.method === "lineTo");
    expect(moveTos.length).toBeGreaterThan(0);
    expect(lineTos.length).toBe(moveTos.length); // paired
  });

  it("defaults to lines style when gridStyle is undefined", () => {
    const { target, calls } = makeRecorder();
    // No gridStyle set
    const scene = sceneWithGrid(20, 1, undefined);
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    // Should use lines: stroke() is called, no rect() for dots
    expect(calls.some((c) => c.method === "stroke")).toBe(true);
    // rect() is the dot-drawing primitive — must not appear
    expect(calls.find((c) => c.method === "rect")).toBeUndefined();
  });

  it("sets setStrokeWidth to 1/zoom", () => {
    const { target, calls } = makeRecorder();
    const zoom = 2;
    const scene = sceneWithGrid(20, zoom, "lines");
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    const sw = calls.find((c) => c.method === "setStrokeWidth");
    expect(sw).toBeDefined();
    expect(sw!.args[0]).toBeCloseTo(1 / zoom);
  });
});

// ---------------------------------------------------------------------------
// Tests: dots mode
// ---------------------------------------------------------------------------
describe("renderGrid – dots style", () => {
  it("calls fill() and rect() instead of stroke() for dots", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(20, 1, "dots");
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    expect(calls.some((c) => c.method === "fill")).toBe(true);
    expect(calls.some((c) => c.method === "rect")).toBe(true);
  });

  it("does NOT call stroke() in dots mode", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(20, 1, "dots");
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    expect(calls.find((c) => c.method === "stroke")).toBeUndefined();
  });

  it("calls setFill with the grid colour in dots mode", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(20, 1, "dots");
    renderGrid(scene, target, { color: "#123456", levels: SINGLE_LEVEL });
    const fillStyleCalls = calls.filter((c) => c.method === "setFill");
    expect(fillStyleCalls.length).toBeGreaterThan(0);
    expect(fillStyleCalls[0]!.args[0]).toBe("#123456");
  });

  it("calls setStroke(null) in dots mode", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(20, 1, "dots");
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    const noStroke = calls.find((c) => c.method === "setStroke" && c.args[0] === null);
    expect(noStroke).toBeDefined();
  });

  it("emits one fill() per dot (beginPath + rect + fill triple)", () => {
    const { target, calls } = makeRecorder(200, 200);
    // zoom=1, gridSize=100, single level → dots every 100 world units
    // snapped world rect for 200×200 at origin: roughly 3×3=9 dots
    const scene = sceneWithGrid(100, 1, "dots");
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    const fills = calls.filter((c) => c.method === "fill").length;
    const rects = calls.filter((c) => c.method === "rect").length;
    expect(fills).toBeGreaterThan(0);
    expect(fills).toBe(rects); // one fill per rect
  });
});

// ---------------------------------------------------------------------------
// Tests: opacity / level visibility
// ---------------------------------------------------------------------------
describe("renderGrid – level opacity", () => {
  it("skips levels whose opacity ≤ 0 (zoom below min)", () => {
    const { target, calls } = makeRecorder();
    // level min=1, zoom=0.5 → below min → skip
    const levels: readonly GridLevel[] = [{ min: 1, mid: 2, step: 1 }];
    const scene = sceneWithGrid(20, 0.5);
    renderGrid(scene, target, { levels });
    // No drawing should happen (only save/restore/setTransform from the outer bracket)
    expect(calls.find((c) => c.method === "stroke" || c.method === "fill")).toBeUndefined();
  });

  it("draws at full opacity when zoom ≥ mid", () => {
    const { target, calls } = makeRecorder();
    const levels: readonly GridLevel[] = [{ min: 0, mid: 1, step: 1 }];
    const scene = sceneWithGrid(20, 2); // zoom=2 ≥ mid=1
    renderGrid(scene, target, { levels });
    const opacityCalls = calls.filter((c) => c.method === "setOpacity" && c.args[0] !== 1);
    expect(opacityCalls).toHaveLength(0); // only full-opacity calls
    const fullOpacity = calls.filter((c) => c.method === "setOpacity" && c.args[0] === 1);
    // At least the reset-to-1 at the end, and the level paint itself.
    expect(fullOpacity.length).toBeGreaterThanOrEqual(1);
  });

  it("interpolates opacity when zoom is between min and mid", () => {
    const { target, calls } = makeRecorder();
    // min=0, mid=2, zoom=1 → opacity = (1-0)/(2-0) = 0.5
    const levels: readonly GridLevel[] = [{ min: 0, mid: 2, step: 1 }];
    const scene = sceneWithGrid(20, 1);
    renderGrid(scene, target, { levels });
    const setOpacityCalls = calls.filter(
      (c) => c.method === "setOpacity" && typeof c.args[0] === "number" && c.args[0] < 1,
    );
    expect(setOpacityCalls.length).toBeGreaterThan(0);
    expect(setOpacityCalls[0]!.args[0]).toBeCloseTo(0.5);
  });

  it("skips levels whose screen spacing is too small (< 4 px)", () => {
    const { target, calls } = makeRecorder();
    // gridSize=1, zoom=0.001, step=1 → screenSpacing = 1*0.001 = 0.001 < 4 → skip
    const levels: readonly GridLevel[] = [{ min: -1, mid: 0, step: 1 }];
    const scene = sceneWithGrid(1, 0.001);
    renderGrid(scene, target, { levels });
    expect(calls.find((c) => c.method === "stroke" || c.method === "fill")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: multiple levels
// ---------------------------------------------------------------------------
describe("renderGrid – multiple levels", () => {
  it("renders multiple visible levels in sequence", () => {
    const { target, calls } = makeRecorder();
    // Both levels visible at zoom=1
    const levels: readonly GridLevel[] = [
      { min: 0, mid: 0.5, step: 4 },
      { min: 0, mid: 0.5, step: 1 },
    ];
    const scene = sceneWithGrid(20, 1, "lines");
    renderGrid(scene, target, { levels });
    // Two stroke() calls, one per level
    const strokes = calls.filter((c) => c.method === "stroke").length;
    expect(strokes).toBe(2);
  });

  it("uses default levels when none specified", () => {
    const { target, calls } = makeRecorder();
    // zoom=1 is within the default ladder ranges for some levels
    const scene = sceneWithGrid(20, 1);
    renderGrid(scene, target); // no levels override
    // Something should be drawn (save/restore present at minimum)
    expect(calls.some((c) => c.method === "save")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: custom color option
// ---------------------------------------------------------------------------
describe("renderGrid – custom color", () => {
  it("uses provided color over default", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(20, 1, "lines");
    renderGrid(scene, target, { color: "#ff0000", levels: SINGLE_LEVEL });
    const strokeCalls = calls.filter((c) => c.method === "setStroke");
    expect(strokeCalls.some((c) => c.args[0] === "#ff0000")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: setDashArray(null) called
// ---------------------------------------------------------------------------
describe("renderGrid – dash reset", () => {
  it("resets dash array to null before drawing", () => {
    const { target, calls } = makeRecorder();
    const scene = sceneWithGrid(20, 1, "lines");
    renderGrid(scene, target, { levels: SINGLE_LEVEL });
    const dashCall = calls.find((c) => c.method === "setDashArray");
    expect(dashCall).toBeDefined();
    expect(dashCall!.args[0]).toBeNull();
  });
});
