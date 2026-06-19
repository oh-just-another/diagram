import { describe, expect, it } from "vitest";
import { isEditableTarget } from "../src/index";

describe("isEditableTarget", () => {
  it("returns false for null", () => {
    expect(isEditableTarget(null)).toBe(false);
  });

  it("returns false for a non-HTMLElement EventTarget", () => {
    expect(isEditableTarget(new EventTarget())).toBe(false);
  });

  it("returns false for an SVG element (not an HTMLElement)", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    expect(isEditableTarget(svg)).toBe(false);
  });

  it.each(["input", "textarea", "select"])("returns true for <%s>", (tag) => {
    expect(isEditableTarget(document.createElement(tag))).toBe(true);
  });

  it.each(["div", "button", "a", "span"])("returns false for non-editable <%s>", (tag) => {
    expect(isEditableTarget(document.createElement(tag))).toBe(false);
  });

  it("returns true for a contenteditable host", () => {
    const el = document.createElement("div");
    el.setAttribute("contenteditable", "true");
    expect(isEditableTarget(el)).toBe(true);
  });

  it("returns false for a plain div whose isContentEditable is false", () => {
    const el = document.createElement("div");
    expect(el.isContentEditable).toBe(false);
    expect(isEditableTarget(el)).toBe(false);
  });
});
