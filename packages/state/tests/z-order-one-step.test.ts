/**
 * One-step z-order ops — bringForward / sendBackward. Walks a
 * 3-shape stack a→b→c (bottom→top) through every transition and
 * asserts the final order. Shares the noop-target / host helper
 * with the `compact-z-order` suite.
 */
import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  apply,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Patch,
  type Scene,
  type Element,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const noopTarget = {
  save: () => {}, restore: () => {}, setTransform: () => {}, clear: () => {},
  setFill: () => {}, setStroke: () => {}, setStrokeWidth: () => {},
  setOpacity: () => {}, setLineCap: () => {}, setLineJoin: () => {},
  setDashArray: () => {}, setFont: () => {}, setTextAlign: () => {},
  setTextBaseline: () => {}, beginPath: () => {}, closePath: () => {},
  moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {},
  bezierCurveTo: () => {}, rect: () => {}, ellipse: () => {},
  fill: () => {}, stroke: () => {}, fillText: () => {},
  measureText: () => ({ width: 0 }), drawImage: () => {},
  translate: () => {}, rotate: () => {}, scale: () => {},
  resetTransform: () => {}, size: { width: 100, height: 100 },
} as never;

const host = {
  addEventListener: () => {}, removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  style: { cursor: "" },
} as never;

const rect = (id: string, order: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: order as Element["order"],
  style: { fill: "#000" },
  width: 10,
  height: 10,
});

const sceneOf = (shapes: Element[]): Scene => {
  let s = emptyScene();
  for (const sh of shapes) {
    s = apply(s, { kind: "element", id: sh.id, before: null, after: sh } satisfies Patch);
  }
  return s;
};

/** Sorted shape ids bottom → top. */
const stack = (editor: Editor): string[] =>
  [...editor.scene.shapes.values()]
    .sort((x, y) => (x.order < y.order ? -1 : x.order > y.order ? 1 : 0))
    .map((sh) => sh.id);

const makeStack = () => {
  const oA = orderBetween(null, null);
  const oB = orderBetween(oA, null);
  const oC = orderBetween(oB, null);
  const editor = new Editor({
    host,
    mainTarget: noopTarget,
    overlayTarget: noopTarget,
    initialScene: sceneOf([rect("a", oA), rect("b", oB), rect("c", oC)]),
  });
  return editor;
};

describe("Editor z-order (one step)", () => {
  it("bringForward moves the middle shape past the top neighbour", () => {
    const editor = makeStack();
    editor.bringForward(elementId("b"));
    expect(stack(editor)).toEqual(["a", "c", "b"]);
  });

  it("bringForward on the topmost shape is a no-op", () => {
    const editor = makeStack();
    const before = stack(editor);
    editor.bringForward(elementId("c"));
    expect(stack(editor)).toEqual(before);
  });

  it("sendBackward moves the middle shape past the bottom neighbour", () => {
    const editor = makeStack();
    editor.sendBackward(elementId("b"));
    expect(stack(editor)).toEqual(["b", "a", "c"]);
  });

  it("sendBackward on the bottommost shape is a no-op", () => {
    const editor = makeStack();
    const before = stack(editor);
    editor.sendBackward(elementId("a"));
    expect(stack(editor)).toEqual(before);
  });

  it("bringForward + sendBackward returns to the original stack", () => {
    const editor = makeStack();
    const before = stack(editor);
    editor.bringForward(elementId("b"));
    editor.sendBackward(elementId("b"));
    expect(stack(editor)).toEqual(before);
  });

  it("defaults the target to the lone selected shape", () => {
    const editor = makeStack();
    editor.setSelection([elementId("b")]);
    editor.bringForward();
    expect(stack(editor)).toEqual(["a", "c", "b"]);
  });
});
