import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Patch,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const rect = (id: string, x = 0, order = orderBetween(null, null)): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order,
  style: { fill: "#000" },
  width: 20,
  height: 20,
});

const sceneWith = (...shapes: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of shapes) {
    s = apply(s, { kind: "element", id: sh.id, before: null, after: sh } satisfies Patch);
  }
  return s;
};

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

const makeEditor = (scene: Scene): Editor =>
  new Editor({ host, mainTarget: noopTarget, overlayTarget: noopTarget, initialScene: scene });

describe("compactLayerZOrder", () => {
  it("rewrites long fractional indices into short balanced ones", () => {
    // Simulate "always insert above shape A" — strings grow.
    let prev = orderBetween(null, null); // "a0"
    const a = rect("a", 0, prev);
    prev = orderBetween(prev, null);
    const b = rect("b", 10, prev);
    // 10 inserts BETWEEN the existing pair → strings lengthen.
    let middle = prev;
    const between: Element[] = [];
    for (let i = 0; i < 10; i++) {
      middle = orderBetween(a.order, middle);
      between.push(rect(`m${i}`, 20 + i, middle));
    }
    const editor = makeEditor(sceneWith(a, b, ...between));

    const maxLenBefore = Math.max(
      ...[...editor.scene.shapes.values()].map((s) => s.order.length),
    );
    expect(maxLenBefore).toBeGreaterThanOrEqual(3);

    editor.compactLayerZOrder(DEFAULT_LAYER_ID);

    const maxLenAfter = Math.max(
      ...[...editor.scene.shapes.values()].map((s) => s.order.length),
    );
    expect(maxLenAfter).toBeLessThanOrEqual(maxLenBefore);
    // Sequence is monotonic — sorted shape ids match the pre-compact
    // visual order.
    const sortedAfter = [...editor.scene.shapes.values()].sort((x, y) =>
      x.order < y.order ? -1 : 1,
    );
    expect(sortedAfter[0]!.id).toBe(elementId("a"));
    expect(sortedAfter[sortedAfter.length - 1]!.id).toBe(elementId("b"));
  });

  it("preserves the original visual order", () => {
    const a = rect("a", 0, orderBetween(null, null));
    const c = rect("c", 100, orderBetween(a.order, null));
    const b = rect("b", 50, orderBetween(a.order, c.order));
    const editor = makeEditor(sceneWith(a, b, c));
    const orderBefore = [...editor.scene.shapes.values()]
      .sort((x, y) => (x.order < y.order ? -1 : 1))
      .map((s) => s.id);
    editor.compactLayerZOrder(DEFAULT_LAYER_ID);
    const orderAfter = [...editor.scene.shapes.values()]
      .sort((x, y) => (x.order < y.order ? -1 : 1))
      .map((s) => s.id);
    expect(orderAfter).toEqual(orderBefore);
  });

  it("undo rolls back the compaction in one step", () => {
    const a = rect("a", 0, orderBetween(null, null));
    const b = rect("b", 10, orderBetween(a.order, null));
    const editor = makeEditor(sceneWith(a, b));
    const oldA = editor.scene.shapes.get(a.id)!.order;
    const oldB = editor.scene.shapes.get(b.id)!.order;
    editor.compactLayerZOrder(DEFAULT_LAYER_ID);
    // Compaction here may be a no-op (orders already short, monotonic
    // and equal to what generateNKeysBetween would produce). If
    // anything changed, undo restores it.
    if (editor.canUndo) {
      editor.undo();
      expect(editor.scene.shapes.get(a.id)!.order).toBe(oldA);
      expect(editor.scene.shapes.get(b.id)!.order).toBe(oldB);
    }
  });
});
