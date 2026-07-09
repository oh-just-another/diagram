import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  type Scene,
  type TextElement,
} from "@oh-just-another/scene";
import { Editor } from "../src/editor.js";

const textElement = (id: string, text = "Hello world"): TextElement => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "text",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  text,
  fontFamily: "Arial",
  fontSize: 14,
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
  quadraticCurveTo: () => {},
  bezierCurveTo: () => {},
  rect: () => {},
  ellipse: () => {},
  fill: () => {},
  stroke: () => {},
  fillText: () => {},
  measureText: () => ({ width: 0 }),
  drawImage: () => {},
  translate: () => {},
  rotate: () => {},
  scale: () => {},
  resetTransform: () => {},
  size: { width: 100, height: 100 },
} as never;

const host = {
  addEventListener: () => {},
  removeEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  style: { cursor: "" },
} as never;

const makeEditor = (scene: Scene): Editor =>
  new Editor({ host, mainTarget: noopTarget, overlayTarget: noopTarget, initialScene: scene });

const sceneWithText = (): Scene => {
  const { scene } = addElement(emptyScene(), textElement("t"));
  return scene;
};

const runsOf = (e: Editor): TextElement["runs"] =>
  (e.scene.elements.get(elementId("t")) as TextElement).runs;

describe("Editor.applyTextStyleToRange", () => {
  it("creates styled runs over a sub-range", () => {
    const e = makeEditor(sceneWithText());
    e.applyTextStyleToRange(elementId("t"), 0, 5, { fontWeight: "bold" });
    expect(runsOf(e)).toEqual([
      { text: "Hello", style: { fontWeight: "bold" } },
      { text: " world" },
    ]);
  });

  it("toggles bold back off (re-applying normal clears the bold weight)", () => {
    const e = makeEditor(sceneWithText());
    e.applyTextStyleToRange(elementId("t"), 0, 5, { fontWeight: "bold" });
    e.applyTextStyleToRange(elementId("t"), 0, 5, { fontWeight: "normal" });
    const runs = runsOf(e);
    // The range is no longer bold — either the overlay is shed entirely
    // (plain text) or the run carries a non-bold weight.
    const boldSpan = (runs ?? []).some((r) => r.style?.fontWeight === "bold");
    expect(boldSpan).toBe(false);
  });

  it("records one undo step and restores the plain text on undo", () => {
    const e = makeEditor(sceneWithText());
    e.applyTextStyleToRange(elementId("t"), 0, 5, { fontWeight: "bold" });
    expect(e.canUndo).toBe(true);
    e.undo();
    expect(runsOf(e)).toBeUndefined();
  });

  it("is a no-op for an empty range (nothing pushed to history)", () => {
    const e = makeEditor(sceneWithText());
    e.applyTextStyleToRange(elementId("t"), 3, 3, { fontStyle: "italic" });
    expect(runsOf(e)).toBeUndefined();
    expect(e.canUndo).toBe(false);
  });

  it("keeps the flat text intact as the source of truth", () => {
    const e = makeEditor(sceneWithText());
    e.applyTextStyleToRange(elementId("t"), 6, 11, { fill: "#f00" });
    expect((e.scene.elements.get(elementId("t")) as TextElement).text).toBe("Hello world");
  });

  it("does nothing on a non-text element", () => {
    const { scene } = addElement(emptyScene(), {
      id: elementId("r"),
      layerId: DEFAULT_LAYER_ID,
      type: "rectangle",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(null, null),
      style: {},
      width: 10,
      height: 10,
    });
    const e = makeEditor(scene);
    e.applyTextStyleToRange(elementId("r"), 0, 2, { fontWeight: "bold" });
    expect(e.canUndo).toBe(false);
  });
});
