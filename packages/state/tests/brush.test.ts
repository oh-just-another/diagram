import { describe, expect, it } from "vitest";
import { emptyScene, type Scene, type Shape } from "@oh-just-another/scene";
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
    const shape = editor.scene.shapes.get(id!) as Extract<Shape, { type: "brush" }>;
    expect(shape.type).toBe("brush");
    expect(shape.position).toEqual({ x: 10, y: 10 });
    expect(shape.points.length).toBe(3);
    expect(shape.points[1]!.width).toBeGreaterThan(shape.points[2]!.width);
    expect(editor.pendingBrushStroke).toBeNull();
  });

  it("cancel discards the in-progress stroke", () => {
    const editor = makeEditor(emptyScene());
    editor.beginBrushStroke({ x: 0, y: 0 });
    editor.extendBrushStroke({ x: 5, y: 5 });
    editor.cancelBrushStroke();
    expect(editor.pendingBrushStroke).toBeNull();
    expect(editor.scene.shapes.size).toBe(0);
  });
});
