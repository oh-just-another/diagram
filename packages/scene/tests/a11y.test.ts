import { describe, expect, it } from "vitest";
import { shapeId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  getShapeAccessibleName,
  orderBetween,
  registerAccessibleName,
  type Shape,
} from "../src/index";

const baseFields = {
  layerId: DEFAULT_LAYER_ID,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
} as const;

describe("getShapeAccessibleName", () => {
  it("titleises built-in types as fallback", () => {
    const rect: Shape = {
      ...baseFields,
      id: shapeId("a"),
      type: "rectangle",
      width: 10,
      height: 10,
    };
    expect(getShapeAccessibleName(rect)).toBe("Rectangle");
  });

  it("uses text body for text shapes", () => {
    const text: Shape = {
      ...baseFields,
      id: shapeId("t"),
      type: "text",
      text: "Hello world",
      fontFamily: "sans",
      fontSize: 12,
    };
    expect(getShapeAccessibleName(text)).toBe("Hello world");
  });

  it("collapses whitespace in text shapes", () => {
    const text: Shape = {
      ...baseFields,
      id: shapeId("t"),
      type: "text",
      text: "Hello\n   world",
      fontFamily: "sans",
      fontSize: 12,
    };
    expect(getShapeAccessibleName(text)).toBe("Hello world");
  });

  it("truncates long text bodies", () => {
    const longText = "a".repeat(200);
    const text: Shape = {
      ...baseFields,
      id: shapeId("t"),
      type: "text",
      text: longText,
      fontFamily: "sans",
      fontSize: 12,
    };
    const result = getShapeAccessibleName(text);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith("…")).toBe(true);
  });

  it("uses metadata.label for templates", () => {
    const template: Shape = {
      ...baseFields,
      id: shapeId("tpl"),
      type: "template",
      templateId: "task-card",
      data: {},
      width: 100,
      height: 60,
      metadata: { label: "Buy milk" },
    };
    expect(getShapeAccessibleName(template)).toBe("Buy milk");
  });

  it("falls back to templateId when no label metadata", () => {
    const template: Shape = {
      ...baseFields,
      id: shapeId("tpl"),
      type: "template",
      templateId: "task-card",
      data: {},
      width: 100,
      height: 60,
    };
    expect(getShapeAccessibleName(template)).toBe("Task card");
  });

  it("registerAccessibleName overrides for custom types", () => {
    registerAccessibleName("custom-widget", () => "Custom widget");
    const custom: Shape = {
      ...baseFields,
      id: shapeId("c"),
      type: "custom-widget",
    };
    expect(getShapeAccessibleName(custom)).toBe("Custom widget");
  });
});
