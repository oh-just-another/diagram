import { describe, expect, it } from "vitest";
import { emptyScene, type Scene, type Element, type BrushPoint } from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";
import { brushCommitPoints } from "../src/editor/public/brush.js";

const makeEditor = (scene: Scene): Editor => {
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
    rect: () => {},
    ellipse: () => {},
    fill: () => {},
    stroke: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }),
    drawImage: () => {},
    drawPoint: () => {},
  } as never;
  const host = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: {},
  } as never;
  return new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });
};

describe("brush stroke", () => {
  it("captures pressure-weighted points and commits a brush shape", () => {
    const editor = makeEditor(emptyScene());
    editor.beginBrushStroke({ x: 10, y: 10 }, 0.5);
    editor.extendBrushStroke({ x: 20, y: 12 }, 0.8);
    editor.extendBrushStroke({ x: 30, y: 14 }, 0.3);
    const id = editor.commitBrushStroke();
    expect(id).not.toBeNull();
    const shape = editor.scene.elements.get(id!) as Extract<Element, { type: "brush" }>;
    expect(shape.type).toBe("brush");
    expect(shape.position).toEqual({ x: 10, y: 10 });
    // Endpoints survive the smoothing pass verbatim (first vertex is the origin,
    // pressure-weighted widths kept): head 0.5·6=3, tail 0.3·6=1.8.
    expect(shape.points[0]).toEqual({ x: 0, y: 0, width: 3 });
    const tail = shape.points[shape.points.length - 1]!;
    expect(tail.x).toBeCloseTo(20);
    expect(tail.width).toBeCloseTo(1.8);
    expect(editor.pendingBrushStroke).toBeNull();
  });

  it("smooths the committed stroke into a dense polyline that ends at the raw release point", () => {
    const editor = makeEditor(emptyScene());
    // A sharp corner: streamline (input low-pass) pulls the stored points off
    // the raw vertices, smoothing resamples the spans, and the commit catch-up
    // appends the raw release point so the stroke still ends under the cursor.
    editor.beginBrushStroke({ x: 0, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 40, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 40, y: 40 }, 0.5);
    const id = editor.commitBrushStroke();
    const shape = editor.scene.elements.get(id!) as Extract<Element, { type: "brush" }>;
    // Three captured vertices → far more stored points after resampling.
    expect(shape.points.length).toBeGreaterThan(3);
    // First point is the origin verbatim; last is the raw release point (the
    // catch-up), NOT the streamlined trail that lags behind the cursor.
    expect(shape.points[0]).toMatchObject({ x: 0, y: 0 });
    const tail = shape.points[shape.points.length - 1]!;
    expect(tail.x).toBeCloseTo(40);
    expect(tail.y).toBeCloseTo(40);
    // The streamline rounds the sharp corner off: the raw corner vertex (40,0)
    // no longer appears verbatim — the path is pulled inside the bend.
    expect(shape.points.some((p) => Math.abs(p.x - 40) < 1e-6 && Math.abs(p.y) < 1e-6)).toBe(false);
  });

  it("streamline damps input jitter but the stroke still reaches the raw endpoint", () => {
    const editor = makeEditor(emptyScene());
    // Zig-zag jitter around y=0: raw samples alternate ±4px. The low-pass must
    // store points with strictly smaller lateral deviation than the raw input.
    editor.beginBrushStroke({ x: 0, y: 0 }, 0.5);
    for (let i = 1; i <= 8; i++) {
      editor.extendBrushStroke({ x: i * 10, y: i % 2 === 0 ? 4 : -4 }, 0.5);
    }
    const pending = editor.pendingBrushStroke!;
    const maxStoredDeviation = Math.max(...pending.points.slice(1).map((p) => Math.abs(p.y)));
    expect(maxStoredDeviation).toBeLessThan(4);
    // Commit appends the raw catch-up point: the stroke ends where the pointer was.
    const id = editor.commitBrushStroke();
    const shape = editor.scene.elements.get(id!) as Extract<Element, { type: "brush" }>;
    const tail = shape.points[shape.points.length - 1]!;
    expect(tail.x).toBeCloseTo(80);
    expect(tail.y).toBeCloseTo(4);
  });

  it("smooths the LIVE preview stroke, not just the committed one", () => {
    // The render snapshot must carry the in-progress stroke resampled with the
    // SAME smoother the commit uses, so it reads smooth as it's drawn instead of
    // snapping from an angular polyline to a curve only on release.
    const editor = makeEditor(emptyScene());
    editor.beginBrushStroke({ x: 0, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 40, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 40, y: 40 }, 0.5); // 3 raw vertices, sharp corner
    const pending = editor.pendingBrushStroke!;
    const snap = (
      editor as unknown as {
        buildRenderSnapshot(): { brushStroke: { points: readonly BrushPoint[] } | null };
      }
    ).buildRenderSnapshot();
    expect(snap.brushStroke).not.toBeNull();
    // The preview points are the commit-pipeline output (catch-up + smoothing) —
    // denser than the stored polyline.
    expect(snap.brushStroke!.points.length).toBe(brushCommitPoints(pending).length);
    expect(snap.brushStroke!.points.length).toBeGreaterThan(pending.points.length);
  });

  it("preview carries the chosen brush colour and opacity (not a hardcoded fill)", () => {
    // Regression: the live preview used a hardcoded dark-grey fill at full alpha,
    // so it ignored the palette colour and opacity the committed stroke uses.
    const editor = makeEditor(emptyScene());
    editor.setBrushSettings({ stroke: "#ff0000", opacity: 0.4 });
    editor.beginBrushStroke({ x: 0, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 10, y: 0 }, 0.5);
    const snap = (
      editor as unknown as {
        buildRenderSnapshot(): { brushStroke: { fill: string; opacity: number } | null };
      }
    ).buildRenderSnapshot();
    expect(snap.brushStroke).not.toBeNull();
    expect(snap.brushStroke!.fill).toBe("#ff0000");
    expect(snap.brushStroke!.opacity).toBe(0.4);
  });

  it("cancel discards the in-progress stroke", () => {
    const editor = makeEditor(emptyScene());
    editor.beginBrushStroke({ x: 0, y: 0 });
    editor.extendBrushStroke({ x: 5, y: 5 });
    editor.cancelBrushStroke();
    expect(editor.pendingBrushStroke).toBeNull();
    expect(editor.scene.elements.size).toBe(0);
  });

  it("commits a stroke with the default line colour when settings are untouched", () => {
    const editor = makeEditor(emptyScene());
    editor.beginBrushStroke({ x: 0, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 10, y: 0 }, 0.5);
    const id = editor.commitBrushStroke();
    const shape = editor.scene.elements.get(id!) as Extract<Element, { type: "brush" }>;
    // Default line colour lives in `style.stroke` now (not the old `fill`).
    expect(shape.style.stroke).toBe("#222222");
  });

  it("bakes brushSettings (stroke / fill / opacity) into the committed stroke", () => {
    const editor = makeEditor(emptyScene());
    editor.setBrushSettings({ stroke: "#ff0000", fill: "#00ff00", opacity: 0.5 });
    expect(editor.brushSettings.stroke).toBe("#ff0000");
    editor.beginBrushStroke({ x: 0, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 10, y: 0 }, 0.5);
    const id = editor.commitBrushStroke();
    const shape = editor.scene.elements.get(id!) as Extract<Element, { type: "brush" }>;
    expect(shape.style.stroke).toBe("#ff0000");
    expect(shape.style.fill).toBe("#00ff00");
    expect(shape.style.opacity).toBe(0.5);
  });

  it("scales stroke width by the brushSettings width (pressure ×  width)", () => {
    const editor = makeEditor(emptyScene());
    editor.setBrushSettings({ width: 20 });
    editor.beginBrushStroke({ x: 0, y: 0 }, 1); // pressure 1 → half-width = width
    const pending = editor.pendingBrushStroke!;
    expect(pending.points[0]!.width).toBe(20);
  });

  it("auto-closes a looped stroke when a fill colour is set", () => {
    const editor = makeEditor(emptyScene());
    editor.setBrushSettings({ fill: "#00ff00" });
    editor.beginBrushStroke({ x: 0, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 40, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 40, y: 40 }, 0.5);
    editor.extendBrushStroke({ x: 0, y: 40 }, 0.5);
    editor.extendBrushStroke({ x: 2, y: 2 }, 0.5); // returns near the start
    const id = editor.commitBrushStroke();
    const shape = editor.scene.elements.get(id!) as Extract<Element, { type: "brush" }>;
    expect(shape.closed).toBe(true);
    expect(shape.style.fill).toBe("#00ff00");
  });

  it("does not close a looped stroke when no fill colour is set", () => {
    const editor = makeEditor(emptyScene());
    // default brushSettings.fill is null
    editor.beginBrushStroke({ x: 0, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 40, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 40, y: 40 }, 0.5);
    editor.extendBrushStroke({ x: 0, y: 40 }, 0.5);
    editor.extendBrushStroke({ x: 2, y: 2 }, 0.5);
    const id = editor.commitBrushStroke();
    const shape = editor.scene.elements.get(id!) as Extract<Element, { type: "brush" }>;
    expect(shape.closed).toBeFalsy();
  });

  it("does not close an open stroke even with a fill colour set", () => {
    const editor = makeEditor(emptyScene());
    editor.setBrushSettings({ fill: "#00ff00" });
    editor.beginBrushStroke({ x: 0, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 40, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 80, y: 0 }, 0.5); // ends far from the start
    const id = editor.commitBrushStroke();
    const shape = editor.scene.elements.get(id!) as Extract<Element, { type: "brush" }>;
    expect(shape.closed).toBeFalsy();
  });
});
