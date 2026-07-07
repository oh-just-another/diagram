import { describe, expect, it } from "vitest";
import { isFrame, isText, type FrameElement, type TextElement } from "@oh-just-another/scene";
import { importJsonCanvas } from "../src/jsoncanvas";

const fixture = JSON.stringify({
  nodes: [
    { id: "grp", type: "group", x: -20, y: -20, width: 400, height: 200, label: "Ideas" },
    { id: "t1", type: "text", x: 0, y: 0, width: 160, height: 60, text: "# Hello", color: "1" },
    { id: "t2", type: "text", x: 240, y: 0, width: 160, height: 60, text: "World" },
    {
      id: "f1",
      type: "file",
      x: 0,
      y: 120,
      width: 160,
      height: 60,
      file: "notes/a.md",
      subpath: "#h1",
    },
    { id: "l1", type: "link", x: 240, y: 120, width: 160, height: 60, url: "https://example.com" },
  ],
  edges: [
    { id: "e1", fromNode: "t1", fromSide: "right", toNode: "t2", toSide: "left", label: "next" },
    { id: "e2", fromNode: "t1", toNode: "f1", toEnd: "none" },
  ],
});

describe("importJsonCanvas", () => {
  it("maps text nodes to text elements with position and wrap width", () => {
    const scene = importJsonCanvas(fixture);
    const t1 = [...scene.elements.values()].find((e) => String(e.id) === "t1") as TextElement;
    expect(t1.type).toBe("text");
    expect(t1.text).toBe("# Hello");
    expect(t1.position).toEqual({ x: 0, y: 0 });
    expect(t1.maxWidth).toBe(160);
    expect(t1.style.fill).toBe("#fb464c"); // preset colour "1" → red
  });

  it("maps file and link nodes to text elements (link gets href)", () => {
    const scene = importJsonCanvas(fixture);
    const file = [...scene.elements.values()].find((e) => String(e.id) === "f1") as TextElement;
    expect(file.text).toBe("notes/a.md#h1");
    const link = [...scene.elements.values()].find((e) => String(e.id) === "l1") as TextElement;
    expect(link.text).toBe("https://example.com");
    expect(link.href).toBe("https://example.com");
  });

  it("maps group nodes to frames with the label as name", () => {
    const scene = importJsonCanvas(fixture);
    const frames = [...scene.elements.values()].filter(isFrame) as FrameElement[];
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ width: 400, height: 200, name: "Ideas" });
    expect(frames[0]?.position).toEqual({ x: -20, y: -20 });
  });

  it("maps edges to straight links anchored on the given sides", () => {
    const scene = importJsonCanvas(fixture);
    expect(scene.links.size).toBe(2);
    const e1 = [...scene.links.values()].find((l) => String(l.id) === "e1");
    expect(e1?.from).toMatchObject({ kind: "anchor", anchor: { kind: "named", name: "right" } });
    expect(e1?.to).toMatchObject({ kind: "anchor", anchor: { kind: "named", name: "left" } });
    expect(e1?.routing).toBe("straight");
    expect(e1?.label).toEqual({ text: "next" });
    // toEnd defaults to an arrow per the spec.
    expect(e1?.arrowheads).toEqual({ to: "arrow" });
  });

  it("omits arrowheads when toEnd is none and falls back to center anchors", () => {
    const scene = importJsonCanvas(fixture);
    const e2 = [...scene.links.values()].find((l) => String(l.id) === "e2");
    expect(e2?.arrowheads).toBeUndefined();
    expect(e2?.from).toMatchObject({ anchor: { kind: "named", name: "center" } });
  });

  it("passes hex colours through and ignores unknown colour tokens", () => {
    const scene = importJsonCanvas(
      JSON.stringify({
        nodes: [
          { id: "a", type: "text", x: 0, y: 0, width: 10, height: 10, text: "x", color: "#123456" },
          { id: "b", type: "text", x: 20, y: 0, width: 10, height: 10, text: "y", color: "42" },
        ],
        edges: [],
      }),
    );
    const a = [...scene.elements.values()].find((e) => String(e.id) === "a");
    const b = [...scene.elements.values()].find((e) => String(e.id) === "b");
    expect(a?.style.fill).toBe("#123456");
    expect(b && isText(b) && b.style.fill).not.toBe("42");
  });

  it("skips unknown node types and edges referencing missing nodes", () => {
    const scene = importJsonCanvas(
      JSON.stringify({
        nodes: [
          { id: "weird", type: "widget", x: 0, y: 0, width: 10, height: 10 },
          { id: "ok", type: "text", x: 0, y: 0, width: 10, height: 10, text: "x" },
        ],
        edges: [{ id: "dangling", fromNode: "ok", toNode: "missing" }],
      }),
    );
    expect(scene.elements.size).toBe(1);
    expect(scene.links.size).toBe(0);
  });

  it("imports an empty file as an empty scene and throws on malformed JSON", () => {
    expect(importJsonCanvas("").elements.size).toBe(0);
    expect(importJsonCanvas("{}").elements.size).toBe(0);
    expect(() => importJsonCanvas("[not json")).toThrow(/Invalid JSON Canvas JSON/);
  });

  it("fits the viewport around the canvas content", () => {
    const scene = importJsonCanvas(fixture);
    expect(scene.viewport.size.width).toBeGreaterThanOrEqual(400);
    expect(scene.viewport.size.height).toBeGreaterThanOrEqual(200);
  });
});
