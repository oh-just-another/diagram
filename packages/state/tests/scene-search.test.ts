import { describe, expect, it } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  orderBetween,
  type Element,
  type Link,
  type Scene,
} from "@oh-just-another/scene";
import { elementSearchText, searchScene } from "../src/features/search.js";

const text = (id: string, body: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "text",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  text: body,
  fontFamily: "sans-serif",
  fontSize: 16,
});

const rect = (id: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 40,
  height: 40,
});

const frame = (id: string, name: string): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "frame",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: 100,
  height: 100,
  name,
});

const labelledLink = (id: string, label: string | undefined): Link => ({
  id: linkId(id),
  layerId: DEFAULT_LAYER_ID,
  from: { kind: "point", position: { x: 0, y: 0 } },
  to: { kind: "point", position: { x: 100, y: 100 } },
  routing: "straight",
  order: orderBetween(null, null),
  style: { stroke: "#000" },
  ...(label === undefined ? {} : { label: { text: label } }),
});

const build = (elements: Element[], links: Link[] = []): Scene => {
  let s = emptyScene();
  for (const e of elements) s = addElement(s, e).scene;
  for (const l of links) s = addLink(s, l).scene;
  return s;
};

describe("elementSearchText", () => {
  it("returns text-shape body", () => {
    expect(elementSearchText(text("t", "Hello"))).toBe("Hello");
  });
  it("returns frame name", () => {
    expect(elementSearchText(frame("f", "Zone A"))).toBe("Zone A");
  });
  it("returns null for shapes with no intrinsic text and empty text", () => {
    expect(elementSearchText(rect("r"))).toBeNull();
    expect(elementSearchText(text("t", ""))).toBeNull();
    expect(elementSearchText(frame("f", ""))).toBeNull();
  });
});

describe("searchScene", () => {
  it("matches text shapes case-insensitively by substring", () => {
    const scene = build([text("a", "Alpha node"), text("b", "beta"), rect("r")]);
    const matches = searchScene(scene, "ALP");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ kind: "element", id: elementId("a"), text: "Alpha node" });
  });

  it("matches frame names and edge labels", () => {
    const scene = build([frame("f", "Payments")], [labelledLink("L", "async call")]);
    expect(searchScene(scene, "pay").map((m) => m.id)).toEqual([elementId("f")]);
    const linkMatch = searchScene(scene, "async");
    expect(linkMatch).toHaveLength(1);
    expect(linkMatch[0]).toMatchObject({ kind: "link", id: linkId("L"), text: "async call" });
  });

  it("returns matches in a stable order: elements first, then links", () => {
    const scene = build(
      [text("a", "sync one"), text("b", "sync two")],
      [labelledLink("L", "sync edge")],
    );
    const ids = searchScene(scene, "sync").map((m) => m.id);
    expect(ids).toEqual([elementId("a"), elementId("b"), linkId("L")]);
  });

  it("ignores unlabelled links and returns empty for blank query", () => {
    const scene = build([text("a", "hi")], [labelledLink("L", undefined)]);
    expect(searchScene(scene, "  ")).toEqual([]);
    expect(searchScene(scene, "x")).toEqual([]);
  });
});
