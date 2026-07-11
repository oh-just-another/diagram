import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  isBrush,
  isEllipse,
  isPolygon,
  isRectangle,
  isText,
  orderBetween,
  type Element,
  type Link,
  type Scene,
} from "@oh-just-another/scene";
import { elementId, linkId } from "@oh-just-another/types";
import { exportExcalidraw } from "../src/excalidraw-export";
import { importExcalidraw } from "../src/excalidraw";

interface ExportedDoc {
  type: string;
  version: number;
  elements: Record<string, unknown>[];
  files: Record<string, unknown>;
}

const buildScene = (): Scene => {
  let scene = emptyScene();
  let order = orderBetween(null, null);
  const next = (): typeof order => {
    const o = order;
    order = orderBetween(order, null);
    return o;
  };
  const base = {
    layerId: DEFAULT_LAYER_ID,
    rotation: 0,
    scale: { x: 1, y: 1 },
  };
  const rect: Element = {
    ...base,
    id: elementId("r1"),
    type: "rectangle",
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    order: next(),
    style: { fill: "#ffc9c9", stroke: "#e03131", strokeWidth: 2, roundness: { type: "round" } },
  };
  const ellipse: Element = {
    ...base,
    id: elementId("e1"),
    type: "ellipse",
    position: { x: 200, y: 0 },
    width: 80,
    height: 80,
    order: next(),
    style: { stroke: "#1e1e1e", opacity: 0.5 },
  };
  const diamond: Element = {
    ...base,
    id: elementId("d1"),
    type: "polygon",
    position: { x: 0, y: 200 },
    points: [
      { x: 30, y: 0 },
      { x: 60, y: 40 },
      { x: 30, y: 80 },
      { x: 0, y: 40 },
    ],
    order: next(),
    style: { stroke: "#2f9e44" },
  };
  const triangle: Element = {
    ...base,
    id: elementId("p1"),
    type: "polygon",
    position: { x: 300, y: 200 },
    points: [
      { x: 0, y: 40 },
      { x: 20, y: 0 },
      { x: 40, y: 40 },
    ],
    order: next(),
    style: { stroke: "#1e1e1e" },
  };
  const text: Element = {
    ...base,
    id: elementId("t1"),
    type: "text",
    position: { x: 10, y: 10 },
    order: next(),
    style: { fill: "#1971c2", textAlign: "center" },
    text: "Hi",
    fontFamily: "monospace",
    fontSize: 16,
  };
  const brush: Element = {
    ...base,
    id: elementId("b1"),
    type: "brush",
    position: { x: 400, y: 0 },
    points: [
      { x: 0, y: 0, width: 2 },
      { x: 10, y: 10, width: 4 },
    ],
    order: next(),
    style: { stroke: "#1e1e1e", strokeWidth: 2 },
  };
  for (const el of [rect, ellipse, diamond, triangle, text, brush]) {
    ({ scene } = addElement(scene, el));
  }
  const link: Link = {
    id: linkId("l1"),
    layerId: DEFAULT_LAYER_ID,
    from: { kind: "anchor", elementId: elementId("r1"), anchor: { kind: "named", name: "center" } },
    to: { kind: "anchor", elementId: elementId("e1"), anchor: { kind: "named", name: "center" } },
    routing: "straight",
    arrowheads: { to: "filledArrow" },
    order: orderBetween(null, null),
    style: { stroke: "#1e1e1e", strokeWidth: 1 },
  };
  ({ scene } = addLink(scene, link));
  return scene;
};

const parseExport = (scene: Scene): ExportedDoc =>
  JSON.parse(exportExcalidraw(scene)) as ExportedDoc;

describe("exportExcalidraw", () => {
  it("emits a version-2 document with one element per supported shape", () => {
    const doc = parseExport(buildScene());
    expect(doc.type).toBe("excalidraw");
    expect(doc.version).toBe(2);
    expect(doc.elements.map((e) => e.type).sort()).toEqual([
      "arrow",
      "diamond",
      "ellipse",
      "freedraw",
      "line",
      "rectangle",
      "text",
    ]);
  });

  it("exports rectangles with geometry and style", () => {
    const doc = parseExport(buildScene());
    const rect = doc.elements.find((e) => e.id === "r1");
    expect(rect).toMatchObject({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      strokeColor: "#e03131",
      backgroundColor: "#ffc9c9",
      strokeWidth: 2,
      roundness: { type: 3 },
    });
    const ellipse = doc.elements.find((e) => e.id === "e1");
    expect(ellipse).toMatchObject({ opacity: 50 });
  });

  it("exports a 4-midpoint polygon as diamond and other polygons as closed lines", () => {
    const doc = parseExport(buildScene());
    expect(doc.elements.find((e) => e.id === "d1")?.type).toBe("diamond");
    const line = doc.elements.find((e) => e.id === "p1");
    expect(line?.type).toBe("line");
    // Closed outline: last point repeats the first.
    const pts = line?.points as number[][];
    expect(pts[pts.length - 1]).toEqual(pts[0]);
  });

  it("exports text with colour in strokeColor and a monospace family code", () => {
    const doc = parseExport(buildScene());
    const text = doc.elements.find((e) => e.id === "t1");
    expect(text).toMatchObject({
      type: "text",
      text: "Hi",
      fontSize: 16,
      fontFamily: 3,
      textAlign: "center",
      strokeColor: "#1971c2",
    });
  });

  it("exports brush strokes as freedraw with pressures", () => {
    const doc = parseExport(buildScene());
    const draw = doc.elements.find((e) => e.id === "b1");
    expect(draw?.type).toBe("freedraw");
    expect(draw?.points).toEqual([
      [0, 0],
      [10, 10],
    ]);
    // pressure = halfWidth / (strokeWidth × 2)
    expect(draw?.pressures).toEqual([0.5, 1]);
    expect(draw?.x).toBe(400);
  });

  it("exports links as bound arrows and back-fills boundElements", () => {
    const doc = parseExport(buildScene());
    const arrow = doc.elements.find((e) => e.id === "l1");
    expect(arrow?.type).toBe("arrow");
    expect(arrow?.startBinding).toMatchObject({ elementId: "r1" });
    expect(arrow?.endBinding).toMatchObject({ elementId: "e1" });
    expect(arrow?.endArrowhead).toBe("triangle");
    const rect = doc.elements.find((e) => e.id === "r1");
    expect(rect?.boundElements).toEqual([{ id: "l1", type: "arrow" }]);
  });

  it("skips unsupported shapes (group / template) but keeps groupIds on members", () => {
    let scene = emptyScene();
    const order = orderBetween(null, null);
    const group: Element = {
      id: elementId("g1"),
      layerId: DEFAULT_LAYER_ID,
      type: "group",
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      order,
      style: {},
    };
    const member: Element = {
      id: elementId("m1"),
      layerId: DEFAULT_LAYER_ID,
      type: "rectangle",
      position: { x: 0, y: 0 },
      width: 10,
      height: 10,
      rotation: 0,
      scale: { x: 1, y: 1 },
      order: orderBetween(order, null),
      style: {},
      parentId: elementId("g1"),
    };
    ({ scene } = addElement(scene, group));
    ({ scene } = addElement(scene, member));
    const doc = parseExport(scene);
    expect(doc.elements).toHaveLength(1);
    expect(doc.elements[0]).toMatchObject({ id: "m1", groupIds: ["g1"] });
  });

  it("embeds data-URL images into files and skips external URLs", () => {
    let scene = emptyScene();
    const order = orderBetween(null, null);
    const base = {
      layerId: DEFAULT_LAYER_ID,
      rotation: 0,
      scale: { x: 1, y: 1 },
      width: 10,
      height: 10,
      style: {},
    };
    const dataImage: Element = {
      ...base,
      id: elementId("img1"),
      type: "image",
      position: { x: 0, y: 0 },
      src: "data:image/png;base64,AAAA",
      order,
    };
    const remoteImage: Element = {
      ...base,
      id: elementId("img2"),
      type: "image",
      position: { x: 20, y: 0 },
      src: "https://example.com/x.png",
      order: orderBetween(order, null),
    };
    ({ scene } = addElement(scene, dataImage));
    ({ scene } = addElement(scene, remoteImage));
    const doc = parseExport(scene);
    expect(doc.elements).toHaveLength(1);
    expect(doc.elements[0]).toMatchObject({ type: "image", fileId: "file-img1" });
    expect(doc.files["file-img1"]).toMatchObject({
      mimeType: "image/png",
      dataURL: "data:image/png;base64,AAAA",
    });
  });
});

describe("excalidraw roundtrip", () => {
  it("import → export → import preserves shapes, geometry and links", () => {
    const first = buildScene();
    const second = importExcalidraw(exportExcalidraw(first));
    const third = importExcalidraw(exportExcalidraw(second));

    expect(second.elements.size).toBe(first.elements.size);
    expect(second.links.size).toBe(first.links.size);
    expect(third.elements.size).toBe(second.elements.size);

    const rect = [...second.elements.values()].find(isRectangle);
    expect(rect).toMatchObject({ position: { x: 0, y: 0 }, width: 100, height: 50 });
    expect(rect?.style.fill).toBe("#ffc9c9");

    expect([...second.elements.values()].filter(isEllipse)).toHaveLength(1);
    expect([...second.elements.values()].filter(isPolygon)).toHaveLength(2);
    expect([...second.elements.values()].filter(isBrush)).toHaveLength(1);

    const text = [...second.elements.values()].find(isText);
    expect(text).toMatchObject({ text: "Hi", fontSize: 16, fontFamily: "monospace" });

    const link = [...second.links.values()][0];
    expect(link?.from).toMatchObject({ kind: "anchor" });
    expect(link?.arrowheads).toEqual({ to: "filledArrow" });

    // Diamond survives as a polygon on the bbox midpoints.
    const diamond = [...second.elements.values()]
      .filter(isPolygon)
      .find((p) => p.points.length === 4);
    expect(diamond?.position).toEqual({ x: 0, y: 200 });
    expect(diamond?.points).toEqual([
      { x: 30, y: 0 },
      { x: 60, y: 40 },
      { x: 30, y: 80 },
      { x: 0, y: 40 },
    ]);
  });
});
