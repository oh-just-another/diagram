import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  addElement,
  DEFAULT_LAYER_ID,
  emptyScene,
  isText,
  orderBetween,
  type Scene,
  type TextElement,
} from "@oh-just-another/scene";
import { computeAdjustFontSize } from "../src/editor/public/selection-ops";

const text = (id: string, fontSize: number): TextElement => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "text",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  text: "AB",
  fontFamily: "Arial",
  fontSize,
});

const sceneWith = (...shapes: TextElement[]): Scene => {
  let s = emptyScene();
  for (const sh of shapes) s = addElement(s, sh).scene;
  return s;
};

const sizeAfter = (scene: Scene, id: string): number => {
  const el = scene.elements.get(elementId(id));
  return el && isText(el) ? el.fontSize : NaN;
};

describe("computeAdjustFontSize", () => {
  it("increases by ~10%, at least 1px", () => {
    const r = computeAdjustFontSize(sceneWith(text("t", 20)), [elementId("t")], "increase");
    expect(sizeAfter(r!.scene, "t")).toBe(22); // round(20·1.1)
  });

  it("decreases by ~10%, at least 1px", () => {
    const r = computeAdjustFontSize(sceneWith(text("t", 20)), [elementId("t")], "decrease");
    expect(sizeAfter(r!.scene, "t")).toBe(18); // round(20/1.1) = 18
  });

  it("moves at least 1px at small sizes (no rounding stall)", () => {
    const r = computeAdjustFontSize(sceneWith(text("t", 5)), [elementId("t")], "increase");
    expect(sizeAfter(r!.scene, "t")).toBe(6); // round(5·1.1)=6 ≥ 5+1
  });

  it("steps each shape from its own size in a mixed selection", () => {
    const r = computeAdjustFontSize(
      sceneWith(text("a", 20), text("b", 40)),
      [elementId("a"), elementId("b")],
      "increase",
    );
    expect(sizeAfter(r!.scene, "a")).toBe(22);
    expect(sizeAfter(r!.scene, "b")).toBe(44);
  });

  it("clamps at the floor and returns null when already there", () => {
    expect(computeAdjustFontSize(sceneWith(text("t", 4)), [elementId("t")], "decrease")).toBeNull();
  });

  it("returns null when no text is selected", () => {
    expect(computeAdjustFontSize(sceneWith(text("t", 20)), [], "increase")).toBeNull();
  });
});
