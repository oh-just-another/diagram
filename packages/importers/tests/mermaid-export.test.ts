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
import { exportMermaid } from "../src/mermaid-export";
import { importMermaid } from "../src/index";
import { parseMermaid } from "../src/mermaid";

const buildShapeScene = (): Scene => {
  let scene = emptyScene();
  let order = orderBetween(null, null);
  const next = (): typeof order => {
    const o = order;
    order = orderBetween(order, null);
    return o;
  };
  const base = { layerId: DEFAULT_LAYER_ID, rotation: 0, scale: { x: 1, y: 1 } } as const;
  const rect: Element = {
    ...base,
    id: elementId("r"),
    type: "rectangle",
    position: { x: 0, y: 0 },
    order: next(),
    style: {},
    width: 100,
    height: 60,
  };
  const rectLabel: Element = {
    ...base,
    id: elementId("r-label"),
    type: "text",
    position: { x: 30, y: 25 },
    order: next(),
    style: {},
    text: "Start",
    fontFamily: "system-ui",
    fontSize: 14,
  };
  const ell: Element = {
    ...base,
    id: elementId("e"),
    type: "ellipse",
    position: { x: 200, y: 0 },
    order: next(),
    style: {},
    width: 100,
    height: 60,
  };
  const dia: Element = {
    ...base,
    id: elementId("d"),
    type: "polygon",
    position: { x: 400, y: 0 },
    order: next(),
    style: {},
    points: [
      { x: 50, y: 0 },
      { x: 100, y: 30 },
      { x: 50, y: 60 },
      { x: 0, y: 30 },
    ],
  };
  for (const el of [rect, rectLabel, ell, dia]) ({ scene } = addElement(scene, el));
  return scene;
};

describe("exportMermaid", () => {
  it("maps shapes to Mermaid node syntax with labels", () => {
    const out = exportMermaid(buildShapeScene());
    expect(out.startsWith("flowchart TD")).toBe(true);
    expect(out).toContain("[Start]"); // rectangle + centred text label
    expect(out).toMatch(/\(\(\)\)/); // ellipse, no label
    expect(out).toMatch(/\{\}/); // polygon/diamond, no label
  });

  it("emits skip comments for non-graph elements", () => {
    let scene = emptyScene();
    const base = { layerId: DEFAULT_LAYER_ID, rotation: 0, scale: { x: 1, y: 1 } } as const;
    const brush: Element = {
      ...base,
      id: elementId("b"),
      type: "brush",
      position: { x: 0, y: 0 },
      order: orderBetween(null, null),
      style: {},
      points: [{ x: 0, y: 0, width: 1 }],
    };
    ({ scene } = addElement(scene, brush));
    expect(exportMermaid(scene)).toContain("%% skipped: brush");
  });

  it("round-trips node + edge counts through importMermaid", () => {
    const source = `flowchart TD
A[Start]
B((End))
C{Go}
A --> B
B -->|yes| C`;
    const scene = importMermaid(source);
    const exported = exportMermaid(scene);
    const reparsed = parseMermaid(exported);
    expect(reparsed.nodes).toHaveLength(3);
    expect(reparsed.edges).toHaveLength(2);
  });

  it("preserves edge labels", () => {
    const scene = importMermaid("flowchart TD\nA -->|weight| B");
    const exported = exportMermaid(scene);
    expect(exported).toContain("-->|weight|");
  });
});
