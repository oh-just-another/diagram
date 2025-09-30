import { describe, expect, it } from "vitest";
import { elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  getElementAccessibleName,
  orderBetween,
  registerAccessibleName,
  type Element,
} from "../src/index";

const baseFields = {
  layerId: DEFAULT_LAYER_ID,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
} as const;

describe("getElementAccessibleName", () => {
  it("titleises built-in types as fallback", () => {
    const rect: Element = {
      ...baseFields,
      id: elementId("a"),
      type: "rectangle",
      width: 10,
      height: 10,
    };
    expect(getElementAccessibleName(rect)).toBe("Rectangle");
  });

  it("uses text body for text shapes", () => {
    const text: Element = {
      ...baseFields,
      id: elementId("t"),
      type: "text",
      text: "Hello world",
      fontFamily: "sans",
      fontSize: 12,
    };
    expect(getElementAccessibleName(text)).toBe("Hello world");
  });

  it("collapses whitespace in text shapes", () => {
    const text: Element = {
      ...baseFields,
      id: elementId("t"),
      type: "text",
      text: "Hello\n   world",
      fontFamily: "sans",
      fontSize: 12,
    };
    expect(getElementAccessibleName(text)).toBe("Hello world");
  });

  it("truncates long text bodies", () => {
    const longText = "a".repeat(200);
    const text: Element = {
      ...baseFields,
      id: elementId("t"),
      type: "text",
      text: longText,
      fontFamily: "sans",
      fontSize: 12,
    };
    const result = getElementAccessibleName(text);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith("…")).toBe(true);
  });

  it("uses metadata.label for templates", () => {
    const template: Element = {
      ...baseFields,
      id: elementId("tpl"),
      type: "template",
      templateId: "task-card",
      data: {},
      width: 100,
      height: 60,
      metadata: { label: "Buy milk" },
    };
    expect(getElementAccessibleName(template)).toBe("Buy milk");
  });

  it("falls back to templateId when no label metadata", () => {
    const template: Element = {
      ...baseFields,
      id: elementId("tpl"),
      type: "template",
      templateId: "task-card",
      data: {},
      width: 100,
      height: 60,
    };
    expect(getElementAccessibleName(template)).toBe("Task card");
  });

  it("registerAccessibleName overrides for custom types", () => {
    registerAccessibleName("custom-widget", () => "Custom widget");
    const custom: Element = {
      ...baseFields,
      id: elementId("c"),
      type: "custom-widget",
    };
    expect(getElementAccessibleName(custom)).toBe("Custom widget");
  });
});
