/**
 * `Editor.setBrushWidth` — re-basing committed brush strokes. Brush widths
 * are baked per point (`style.strokeWidth` has no effect), so the op scales
 * every point width by `newWidth / baseWidth`, preserving the pressure
 * profile, and records the new `baseWidth`. One undo step.
 */
import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  getElement,
  orderBetween,
  type BrushElement,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const brush = (id: string, baseWidth?: number): BrushElement => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "brush",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { stroke: "#000" },
  points: [
    { x: 0, y: 0, width: 3 },
    { x: 10, y: 0, width: 4.2 },
    { x: 20, y: 0, width: 1.8 },
  ],
  ...(baseWidth !== undefined ? { baseWidth } : {}),
});

const rect = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 100, y: 100 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 50,
  height: 50,
});

const sceneWith = (...els: Element[]): Scene => {
  let s = emptyScene();
  for (const e of els) ({ scene: s } = addElement(s, e));
  return s;
};

const noopTarget = new Proxy(
  { measureText: () => ({ width: 0 }), size: { width: 800, height: 600 } } as Record<
    string,
    unknown
  >,
  { get: (o, k: string) => (k in o ? o[k] : () => undefined) },
) as never;

const makeEditor = (scene: Scene): Editor =>
  new Editor({
    host: new Proxy({ style: { cursor: "" } } as Record<string, unknown>, {
      get: (o, k: string) =>
        k in o
          ? o[k]
          : k === "getBoundingClientRect"
            ? () => ({ left: 0, top: 0, width: 800, height: 600 })
            : () => undefined,
    }) as never,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: scene,
  });

const widths = (e: Editor, id: string): number[] =>
  (getElement(e.scene, elementId(id)) as BrushElement).points.map((p) => p.width);

describe("Editor.setBrushWidth", () => {
  it("scales baked widths by newWidth/baseWidth and records the new base", () => {
    const e = makeEditor(sceneWith(brush("b", 6)));
    e.setBrushWidth([elementId("b")], 12);
    expect(widths(e, "b")).toEqual([6, 8.4, 3.6]);
    expect((getElement(e.scene, elementId("b")) as BrushElement).baseWidth).toBe(12);
  });

  it("legacy strokes without baseWidth fall back to the widest point", () => {
    const e = makeEditor(sceneWith(brush("b"))); // no baseWidth; max width 4.2
    e.setBrushWidth([elementId("b")], 8.4);
    expect(widths(e, "b")).toEqual([6, 8.4, 3.6]);
  });

  it("skips non-brush ids and no-ops cleanly", () => {
    const e = makeEditor(sceneWith(rect("r")));
    const before = e.scene;
    e.setBrushWidth([elementId("r")], 12);
    expect(e.scene).toBe(before);
    expect(e.canUndo).toBe(false);
  });

  it("is one undo step across several strokes", () => {
    const e = makeEditor(sceneWith(brush("a", 6), brush("b", 6)));
    e.setBrushWidth([elementId("a"), elementId("b")], 3);
    expect(widths(e, "a")).toEqual([1.5, 2.1, 0.9]);
    expect(widths(e, "b")).toEqual([1.5, 2.1, 0.9]);
    e.undo();
    expect(widths(e, "a")).toEqual([3, 4.2, 1.8]);
    expect(widths(e, "b")).toEqual([3, 4.2, 1.8]);
  });

  it("read-only editors ignore it", () => {
    const e = makeEditor(sceneWith(brush("b", 6)));
    e.setReadOnly(true);
    e.setBrushWidth([elementId("b")], 12);
    expect(widths(e, "b")).toEqual([3, 4.2, 1.8]);
  });
});
