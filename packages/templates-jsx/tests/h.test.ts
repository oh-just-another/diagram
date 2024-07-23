import { describe, expect, it } from "vitest";
import { bind, Fragment, h, tsx2json } from "../src/h";

describe("h() pragma", () => {
  it("builds a container with style + layout + children", () => {
    const node = h(
      "container",
      { id: "root", layout: { flexDirection: "row", gap: 4 }, style: { fill: "#fff" } },
      h("text", null, "Hello"),
      h("button", { action: "ok", label: "OK" }),
    );
    if (node.type !== "container") throw new Error("expected container");
    expect(node.id).toBe("root");
    expect(node.layout?.flexDirection).toBe("row");
    expect(node.children).toHaveLength(2);
    expect(node.children?.[0]?.type).toBe("text");
    expect(node.children?.[1]?.type).toBe("button");
  });

  it("string children become text nodes", () => {
    const node = h("container", null, "hi", 42);
    if (node.type !== "container") throw new Error("expected container");
    expect(node.children).toHaveLength(2);
    expect(node.children?.[0]).toEqual({ type: "text", text: "hi" });
    expect(node.children?.[1]).toEqual({ type: "text", text: "42" });
  });

  it("text reads text from prop or children", () => {
    const fromProp = h("text", { text: "via prop" });
    if (fromProp.type !== "text") throw new Error("expected text");
    expect(fromProp.text).toBe("via prop");

    const fromChildren = h("text", null, "via", " ", "children");
    if (fromChildren.type !== "text") throw new Error("expected text");
    expect(fromChildren.text).toBe("via children");
  });

  it("button label can come from children", () => {
    const node = h("button", { action: "save" }, "Save");
    if (node.type !== "button") throw new Error("expected button");
    expect(node.label).toBe("Save");
    expect(node.action).toBe("save");
  });

  it("bind() injects a Binding object usable as text/label", () => {
    const node = h("text", { text: bind<string>("title") });
    if (node.type !== "text") throw new Error("expected text");
    expect(node.text).toEqual({ bind: "title" });
  });

  it("false / null / undefined children are dropped", () => {
    const node = h("container", null, "keep", false, null, undefined, h("text", null, "also-keep"));
    if (node.type !== "container") throw new Error("expected container");
    expect(node.children).toHaveLength(2);
  });

  it("nested arrays of children are flattened", () => {
    const items = [h("text", null, "a"), h("text", null, "b")];
    const node = h("container", null, items, h("text", null, "c"));
    if (node.type !== "container") throw new Error("expected container");
    expect(node.children).toHaveLength(3);
  });

  it("Fragment collapses to a container without style/layout", () => {
    const node = h(Fragment, null, h("text", null, "x"), h("text", null, "y"));
    if (node.type !== "container") throw new Error("expected container");
    expect(node.style).toBeUndefined();
    expect(node.children).toHaveLength(2);
  });

  it("icon and image carry their bindings unchanged", () => {
    const icon = h("icon", { svg: bind("svg") });
    expect(icon).toEqual({ type: "icon", svg: { bind: "svg" } });
    const image = h("image", { src: "data:," });
    expect(image).toEqual({ type: "image", src: "data:," });
  });

  it("drop-zone preserves accepts whitelist", () => {
    const node = h("drop-zone", { accepts: ["a", "b"], label: "Drop" });
    if (node.type !== "drop-zone") throw new Error("expected drop-zone");
    expect(node.accepts).toEqual(["a", "b"]);
    expect(node.label).toBe("Drop");
  });

  it("tsx2json is identity (JSX output is already JSON)", () => {
    const node = h("text", null, "x");
    expect(tsx2json(node)).toBe(node);
    expect(JSON.parse(JSON.stringify(node))).toEqual(node);
  });
});
