import { describe, expect, it } from "vitest";
import {
  defineRichTemplate,
  resolveBindings,
  getTemplateLocalBounds,
  interactiveNodeAtPoint,
  layoutTree,
  nodeAtPoint,
  type TemplateNode,
} from "../src/rich/index";

const measure = (t: string, _f: string, size: number) => t.length * size * 0.5;

describe("resolveBindings", () => {
  it("substitutes string bindings", () => {
    const node: TemplateNode = { type: "text", text: { bind: "label" } };
    const r = resolveBindings(node, { label: "Hello" });
    if (r.type !== "text") throw new Error("expected text");
    expect(r.text).toBe("Hello");
  });

  it("leaves literal values alone", () => {
    const node: TemplateNode = { type: "text", text: "literal" };
    const r = resolveBindings(node, { whatever: 1 });
    if (r.type !== "text") throw new Error("expected text");
    expect(r.text).toBe("literal");
  });

  it("missing key falls back to empty string", () => {
    const node: TemplateNode = { type: "text", text: { bind: "missing" } };
    const r = resolveBindings(node, {});
    if (r.type !== "text") throw new Error("expected text");
    expect(r.text).toBe("");
  });

  it("recurses into container children", () => {
    const tree: TemplateNode = {
      type: "container",
      children: [
        { type: "text", text: { bind: "a" } },
        { type: "text", text: { bind: "b" } },
      ],
    };
    const r = resolveBindings(tree, { a: "A", b: "B" });
    if (r.type !== "container") throw new Error("expected container");
    const [first, second] = r.children!;
    if (first?.type !== "text" || second?.type !== "text") throw new Error("expected text");
    expect(first.text).toBe("A");
    expect(second.text).toBe("B");
  });

  it("handles icon, image, button.label and drop-zone.label", () => {
    const tree: TemplateNode = {
      type: "container",
      children: [
        { type: "icon", svg: { bind: "icon" } },
        { type: "image", src: { bind: "src" } },
        { type: "button", action: "x", label: { bind: "btnLabel" } },
        { type: "drop-zone", label: { bind: "dropLabel" } },
      ],
    };
    const r = resolveBindings(tree, {
      icon: "<svg/>",
      src: "u",
      btnLabel: "Click",
      dropLabel: "Drop here",
    });
    if (r.type !== "container") throw new Error("expected container");
    const [icon, image, button, drop] = r.children!;
    if (icon?.type !== "icon" || image?.type !== "image") throw new Error("kind");
    if (button?.type !== "button" || drop?.type !== "drop-zone") throw new Error("kind");
    expect(icon.svg).toBe("<svg/>");
    expect(image.src).toBe("u");
    expect(button.label).toBe("Click");
    expect(drop.label).toBe("Drop here");
  });
});

describe("getTemplateLocalBounds", () => {
  it("returns root bounds after layout", () => {
    const tree: TemplateNode = {
      type: "container",
      layout: { padding: 4, flexDirection: "row", gap: 2 },
      children: [
        { type: "container", layout: { width: 30, height: 20 } },
        { type: "container", layout: { width: 40, height: 20 } },
      ],
    };
    const b = getTemplateLocalBounds(tree, {}, { measureText: measure });
    // width: 4 + 30 + 2 + 40 + 4 = 80, height: 4 + 20 + 4 = 28
    expect(b.width).toBe(80);
    expect(b.height).toBe(28);
  });

  it("respects data binding when measuring text", () => {
    const tree: TemplateNode = {
      type: "container",
      layout: { padding: 0 },
      children: [{ type: "text", text: { bind: "msg" }, style: { fontSize: 10 } }],
    };
    const b = getTemplateLocalBounds(tree, { msg: "abcdefg" }, { measureText: measure });
    expect(b.width).toBe(7 * 10 * 0.5);
  });
});

describe("defineRichTemplate", () => {
  it("returns the template unchanged", () => {
    const t = defineRichTemplate({
      id: "test",
      name: "Test",
      category: "test",
      icon: "<svg/>",
      root: { type: "container" },
    });
    expect(t.id).toBe("test");
  });
});

describe("hit-test", () => {
  const tree: TemplateNode = {
    type: "container",
    id: "root",
    layout: { padding: 4, flexDirection: "row", gap: 2, width: 100, height: 40 },
    children: [
      { type: "container", id: "left", layout: { width: 30, height: 30 } },
      { type: "button", id: "btn", action: "ok", label: "OK" },
    ],
  };

  it("nodeAtPoint returns deepest node containing point", () => {
    const layouted = layoutTree(tree, { measureText: measure });
    const hit = nodeAtPoint(layouted, { x: 10, y: 10 });
    expect(hit?.node.id).toBe("left");
  });

  it("returns null outside root", () => {
    const layouted = layoutTree(tree, { measureText: measure });
    expect(nodeAtPoint(layouted, { x: 9999, y: 9999 })).toBeNull();
  });

  it("interactiveNodeAtPoint filters out non-interactive ancestors", () => {
    const layouted = layoutTree(tree, { measureText: measure });
    // The button sits to the right of `left`; pick a point inside the button.
    const buttonBounds = layouted.children[1]!.bounds;
    const inside = { x: buttonBounds.x + 3, y: buttonBounds.y + 3 };
    const hit = interactiveNodeAtPoint(layouted, inside);
    expect(hit?.node.id).toBe("btn");
  });

  it("interactiveNodeAtPoint returns null when no interactive ancestor", () => {
    const layouted = layoutTree(tree, { measureText: measure });
    const hit = interactiveNodeAtPoint(layouted, { x: 10, y: 10 });
    expect(hit).toBeNull();
  });
});
