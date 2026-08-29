import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  orderBetween,
  type Element,
  type Scene,
} from "@oh-just-another/scene";
import { elementId } from "@oh-just-another/types";
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

const rect = (id: string, text?: string): Element =>
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
  }) as Element;

describe("exportCsv", () => {
  it("writes a header and one row per element with text, tags, author and bounds", () => {
    const sticky = {
      ...base,
      id: elementId("s1"),
      type: "sticky",
      position: { x: 0, y: 0 },
      order: orderBetween(null, null),
      style: {},
      width: 160,
      height: 160,
      label: { text: "Plan" },
      tags: ["todo", "q3"],
      authorName: "Alice",
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
    const csv = exportCsv(sceneOf(rect("r1", "Box"), sticky, text));
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines[1]).toBe("r1,rectangle,Default,Box,,,10,20,100,60");
    expect(lines[2]).toBe("s1,sticky,Default,Plan,todo;q3,Alice,0,0,160,160");
    expect(lines[3]?.startsWith("t1,text,Default,Hello,,,5,5,")).toBe(true);
    expect(lines.at(-1)).toBe("");
  });

  it("quotes fields holding commas, quotes or line breaks (RFC 4180)", () => {
    const csv = exportCsv(sceneOf(rect("r1", 'Say "hi", then\nleave')));
    expect(csv).toContain(',"Say ""hi"", then\nleave",');
  });

  it("is an export-only format with a .csv file name", () => {
    const { text, filename } = exportSceneAs("csv", sceneOf(rect("r1")));
    expect(filename).toBe("diagram.csv");
    expect(text.startsWith("id,type,")).toBe(true);
  });
});
