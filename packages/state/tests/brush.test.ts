import { describe, expect, it } from "vitest";
import { emptyScene, type Scene, type Element } from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

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

  it("smooths the committed stroke into a dense Catmull-Rom polyline", () => {
    const editor = makeEditor(emptyScene());
    // A sharp corner: without smoothing the stored points equal the three
    // captured vertices; smoothing resamples each span into sub-points and
    // bows the path off the raw chord at the bend.
    editor.beginBrushStroke({ x: 0, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 40, y: 0 }, 0.5);
    editor.extendBrushStroke({ x: 40, y: 40 }, 0.5);
    const id = editor.commitBrushStroke();
    const shape = editor.scene.elements.get(id!) as Extract<Element, { type: "brush" }>;
    // Three captured vertices → far more stored points after resampling.
    expect(shape.points.length).toBeGreaterThan(3);
    // The corner vertex (40,0) still appears in the output (Catmull-Rom passes
    // through its control points).
    expect(shape.points.some((p) => Math.abs(p.x - 40) < 1e-6 && Math.abs(p.y) < 1e-6)).toBe(true);
    // Resampling adds intermediate points that are none of the three captured
    // vertices — the span between vertices is filled in, not just the corners.
    const captured = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ];
    const isCaptured = (p: { x: number; y: number }) =>
      captured.some((c) => Math.abs(c.x - p.x) < 1e-6 && Math.abs(c.y - p.y) < 1e-6);
    expect(shape.points.filter((p) => !isCaptured(p)).length).toBeGreaterThan(0);
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
});
