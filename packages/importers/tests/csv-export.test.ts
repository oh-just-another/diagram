import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER_ID,
  addAnnotation,
  addElement,
  addLink,
  emptyScene,
  orderBetween,
  type Annotation,
  type Element,
  type Link,
  type Scene,
} from "@oh-just-another/scene";
import { annotationId, commentId, elementId, linkId } from "@oh-just-another/types";
import { CSV_COLUMNS, exportCsv } from "../src/csv-export.js";
import { exportSceneAs } from "../src/formats.js";

const base = {
  layerId: DEFAULT_LAYER_ID,
  rotation: 0,
  scale: { x: 1, y: 1 },
};

const sceneOf = (...els: Element[]): Scene => {
  let scene = emptyScene();
  let prev: Element["order"] | null = null;
  for (const el of els) {
    const order = orderBetween(prev, null);
    prev = order;
    ({ scene } = addElement(scene, { ...el, order }));
  }
  return scene;
};

const rect = (id: string, text?: string, extra: Record<string, unknown> = {}): Element =>
  ({
    ...base,
    id: elementId(id),
    type: "rectangle",
    position: { x: 10, y: 20 },
    order: orderBetween(null, null),
    style: {},
    width: 100,
    height: 60,
    ...(text === undefined ? {} : { label: { text } }),
    ...extra,
  }) as Element;

const header = CSV_COLUMNS.join(",");
const rowsOf = (csv: string): string[] => csv.split("\r\n");

describe("exportCsv", () => {
  it("writes the header and one row per element with content, style, flags and bounds", () => {
    const sticky = {
      ...base,
      id: elementId("s1"),
      type: "sticky",
      position: { x: 0, y: 0 },
      order: orderBetween(null, null),
      style: { fill: "#fff9b1" },
      width: 160,
      height: 160,
      label: { text: "Plan" },
      tags: ["todo", "q3"],
      authorName: "Alice",
      reactions: [
        { glyph: "👍", users: ["a", "b"] },
        { glyph: "❤️", users: ["c"] },
      ],
    } as unknown as Element;
    const text = {
      ...base,
      id: elementId("t1"),
      type: "text",
      position: { x: 5, y: 5 },
      order: orderBetween(null, null),
      style: {},
      text: "Hello",
      fontFamily: "system-ui",
      fontSize: 16,
    } as unknown as Element;
    const image = {
      ...base,
      id: elementId("i1"),
      type: "image",
      position: { x: 0, y: 0 },
      order: orderBetween(null, null),
      style: {},
      src: "data:,",
      width: 40,
      height: 30,
      alt: "Chart",
    } as unknown as Element;
    const csv = exportCsv(
      sceneOf(
        rect("r1", "Box", {
          style: { fill: "#abc", stroke: "#123" },
          href: "https://example.com",
          locked: true,
          parentId: elementId("g1"),
          rotation: 45,
        }),
        sticky,
        text,
        image,
      ),
    );
    const lines = rowsOf(csv);
    expect(lines[0]).toBe(header);
    expect(
      lines[1]?.startsWith(
        "r1,rectangle,Default,g1,Box,,,,,https://example.com,#abc,#123,true,false,",
      ),
    ).toBe(true);
    expect(lines[1]?.endsWith(",45,,")).toBe(true);
    expect(lines[2]).toBe(
      "s1,sticky,Default,,Plan,todo;q3,Alice,👍:2;❤️:1,,,#fff9b1,,false,false,0,0,160,160,0,,",
    );
    expect(lines[3]?.startsWith("t1,text,Default,,Hello,")).toBe(true);
    expect(lines[4]?.startsWith("i1,image,Default,,Chart,")).toBe(true);
    expect(lines.at(-1)).toBe("");
  });

  it("counts open and resolved comment threads per element", () => {
    let scene = sceneOf(rect("r1"));
    const thread = (id: string, resolved: boolean, n: number): Annotation =>
      ({
        id: annotationId(id),
        elementId: elementId("r1"),
        position: { x: 0, y: 0 },
        resolved,
        createdAt: "2026-01-01T00:00:00Z",
        thread: Array.from({ length: n }, (_, i) => ({
          id: commentId(`${id}-${String(i)}`),
          authorId: "u",
          authorName: "U",
          body: "…",
          createdAt: "2026-01-01T00:00:00Z",
        })),
      }) as unknown as Annotation;
    scene = addAnnotation(scene, thread("a1", false, 2)).scene;
    scene = addAnnotation(scene, thread("a2", true, 1)).scene;
    const row = rowsOf(exportCsv(scene))[1] ?? "";
    expect(row.split(",")[8]).toBe("2 open;1 resolved");
  });

  it("lists links after the layer's elements with label, stroke and endpoint ids", () => {
    let scene = sceneOf(rect("a"), rect("b"));
    const anchor = (id: string): Link["from"] => ({
      kind: "anchor",
      elementId: elementId(id),
      anchor: { kind: "named", name: "right" },
    });
    scene = addLink(scene, {
      id: linkId("ab"),
      layerId: DEFAULT_LAYER_ID,
      order: orderBetween(null, null),
      style: { stroke: "#f00" },
      from: anchor("a"),
      to: { kind: "point", position: { x: 9, y: 9 } },
      label: { text: "yes" },
    } as Link).scene;
    const lines = rowsOf(exportCsv(scene));
    expect(lines[3]).toBe("ab,link,Default,,yes,,,,,,,#f00,,,,,,,,a,");
  });

  it("quotes fields holding commas, quotes or line breaks (RFC 4180)", () => {
    const csv = exportCsv(sceneOf(rect("r1", 'Say "hi", then\nleave')));
    expect(csv).toContain(',"Say ""hi"", then\nleave",');
  });

  it("is an export-only format with a .csv file name", () => {
    const { text, filename } = exportSceneAs("csv", sceneOf(rect("r1")));
    expect(filename).toBe("diagram.csv");
    expect(text.startsWith("id,type,layer,")).toBe(true);
  });
});
