import { describe, expect, it } from "vitest";
import { layerId, elementId } from "@oh-just-another/types";
import {
  getBounder,
  getElementLocalBounds,
  getElementWorldBounds,
  isBlockArrow,
  isBrush,
  isFrame,
  isGroup,
  isImage,
  isRectangle,
  isTemplate,
  orderBetween,
  type BlockArrowElement,
  type BrushElement,
  type FrameElement,
  type GroupElement,
  type TemplateElement,
} from "../src/index";

const baseProps = {
  layerId: layerId("L"),
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
};

const template: TemplateElement = {
  ...baseProps,
  id: elementId("tpl"),
  type: "template",
  templateId: "demo",
  data: {},
  width: 60,
  height: 40,
};

const group: GroupElement = {
  ...baseProps,
  id: elementId("grp"),
  type: "group",
};

const frame: FrameElement = {
  ...baseProps,
  id: elementId("frm"),
  type: "frame",
  width: 200,
  height: 120,
};

const blockArrow: BlockArrowElement = {
  ...baseProps,
  id: elementId("arr"),
  type: "block-arrow",
  width: 80,
  height: 30,
};

const brush: BrushElement = {
  ...baseProps,
  id: elementId("bru"),
  type: "brush",
  points: [
    { x: 0, y: 0, width: 2 },
    { x: 10, y: 4, width: 3 },
  ],
};

describe("shape (extra type guards)", () => {
  it("isTemplate matches only templates", () => {
    expect(isTemplate(template)).toBe(true);
    expect(isTemplate(group)).toBe(false);
  });
  it("isGroup matches only groups", () => {
    expect(isGroup(group)).toBe(true);
    expect(isGroup(frame)).toBe(false);
  });
  it("isFrame matches only frames", () => {
    expect(isFrame(frame)).toBe(true);
    expect(isFrame(blockArrow)).toBe(false);
  });
  it("isBlockArrow matches only block arrows", () => {
    expect(isBlockArrow(blockArrow)).toBe(true);
    expect(isBlockArrow(brush)).toBe(false);
  });
  it("isBrush matches only brushes", () => {
    expect(isBrush(brush)).toBe(true);
    expect(isBrush(template)).toBe(false);
  });
  it("guards are mutually exclusive across these shapes", () => {
    const guards = [isTemplate, isGroup, isFrame, isBlockArrow, isBrush, isRectangle, isImage];
    expect(guards.filter((g) => g(template))).toHaveLength(1);
    expect(guards.filter((g) => g(group))).toHaveLength(1);
    expect(guards.filter((g) => g(frame))).toHaveLength(1);
    expect(guards.filter((g) => g(blockArrow))).toHaveLength(1);
    expect(guards.filter((g) => g(brush))).toHaveLength(1);
  });
});

describe("getBounder", () => {
  it("returns a bounder for a built-in type", () => {
    const bounder = getBounder("rectangle");
    expect(bounder).toBeTypeOf("function");
  });
  it("returns undefined for an unknown type", () => {
    expect(getBounder("totally-unknown-shape")).toBeUndefined();
  });
  it("a looked-up bounder computes the same bounds as getElementLocalBounds", () => {
    const bounder = getBounder("frame");
    expect(bounder?.(frame)).toEqual({ x: 0, y: 0, width: 200, height: 120 });
  });
});

describe("built-in bounders for composite shapes", () => {
  it("template local bounds use the explicit w/h box", () => {
    expect(getElementLocalBounds(template)).toEqual({ x: 0, y: 0, width: 60, height: 40 });
  });
  it("group local bounds are empty (no intrinsic geometry)", () => {
    expect(getElementLocalBounds(group)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
  it("frame local bounds use w/h", () => {
    expect(getElementLocalBounds(frame)).toEqual({ x: 0, y: 0, width: 200, height: 120 });
  });
  it("block-arrow local bounds use w/h", () => {
    expect(getElementLocalBounds(blockArrow)).toEqual({ x: 0, y: 0, width: 80, height: 30 });
  });
  it("brush local bounds expand each point by its half-width", () => {
    // x range: [0-2, 10+3] = [-2, 13] → width 15; y range: [0-2, 4+3] = [-2, 7] → height 9.
    expect(getElementLocalBounds(brush)).toEqual({ x: -2, y: -2, width: 15, height: 9 });
  });
  it("empty brush has zero bounds", () => {
    const empty: BrushElement = { ...brush, id: elementId("empty"), points: [] };
    expect(getElementLocalBounds(empty)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
  it("world bounds of a translated frame shift the local box", () => {
    const moved: FrameElement = { ...frame, position: { x: 10, y: 20 } };
    expect(getElementWorldBounds(moved)).toEqual({ x: 10, y: 20, width: 200, height: 120 });
  });
});
