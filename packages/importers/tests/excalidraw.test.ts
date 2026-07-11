import { describe, expect, it } from "vitest";
import {
  isBrush,
  isEllipse,
  isGroup,
  isPolygon,
  isRectangle,
  isText,
  type BrushElement,
  type PolygonElement,
  type RectangleElement,
  type TextElement,
} from "@oh-just-another/scene";
import { importExcalidraw } from "../src/excalidraw";

const fixture = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "test",
  elements: [
    {
      id: "rect1",
      type: "rectangle",
      x: 10,
      y: 20,
      width: 120,
      height: 60,
      angle: 0,
      strokeColor: "#e03131",
      backgroundColor: "#ffc9c9",
      strokeWidth: 2,
      strokeStyle: "solid",
      opacity: 100,
      roundness: { type: 3 },
      groupIds: [],
    },
    {
      id: "ell1",
      type: "ellipse",
      x: 240,
      y: 20,
      width: 100,
      height: 100,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      opacity: 50,
      groupIds: [],
    },
    {
      id: "dia1",
      type: "diamond",
      x: 10,
      y: 160,
      width: 80,
      height: 80,
      angle: 0,
      groupIds: [],
    },
    {
      id: "txt1",
      type: "text",
      x: 30,
      y: 30,
      width: 80,
      height: 25,
      angle: 0,
      strokeColor: "#1971c2",
      text: "Hello",
      fontSize: 20,
      fontFamily: 3,
      textAlign: "center",
      groupIds: [],
    },
    {
      id: "draw1",
      type: "freedraw",
      x: 300,
      y: 200,
      width: 20,
      height: 20,
      angle: 0,
      strokeWidth: 2,
      points: [
        [0, 0],
        [10, 10],
        [20, 20],
      ],
      pressures: [0.25, 0.5, 1],
      groupIds: [],
    },
    {
      id: "arrow1",
      type: "arrow",
      x: 130,
      y: 50,
      width: 110,
      height: 20,
      angle: 0,
      points: [
        [0, 0],
        [110, 20],
      ],
      startBinding: { elementId: "rect1", focus: 0, gap: 4 },
      endBinding: { elementId: "ell1", focus: 0, gap: 4 },
      endArrowhead: "arrow",
      startArrowhead: null,
    },
    {
      id: "line1",
      type: "line",
      x: 0,
      y: 300,
      width: 50,
      height: 0,
      angle: 0,
      points: [
        [0, 0],
        [25, -10],
        [50, 0],
      ],
      startBinding: null,
      endBinding: null,
    },
  ],
  appState: {},
  files: {},
});

describe("importExcalidraw", () => {
  it("maps rectangle / ellipse / diamond / text / freedraw to built-in shapes", () => {
    const scene = importExcalidraw(fixture);
    const elements = [...scene.elements.values()];
    expect(elements.filter(isRectangle)).toHaveLength(1);
    expect(elements.filter(isEllipse)).toHaveLength(1);
    expect(elements.filter(isPolygon)).toHaveLength(1);
    expect(elements.filter(isText)).toHaveLength(1);
    expect(elements.filter(isBrush)).toHaveLength(1);
  });

  it("keeps absolute positions and carries style over", () => {
    const scene = importExcalidraw(fixture);
    const rect = [...scene.elements.values()].find(isRectangle) as RectangleElement;
    expect(rect.position).toEqual({ x: 10, y: 20 });
    expect(rect.width).toBe(120);
    expect(rect.height).toBe(60);
    expect(rect.style.stroke).toBe("#e03131");
    expect(rect.style.fill).toBe("#ffc9c9");
    expect(rect.style.strokeWidth).toBe(2);
    expect(rect.style.roundness).toEqual({ type: "round" });

    const ellipse = [...scene.elements.values()].find(isEllipse);
    expect(ellipse?.style.opacity).toBe(0.5);
    expect(ellipse?.style.fill).toBeUndefined(); // transparent → omitted
  });

  it("maps diamond to a 4-point polygon on the bbox midpoints", () => {
    const scene = importExcalidraw(fixture);
    const diamond = [...scene.elements.values()].find(isPolygon) as PolygonElement;
    expect(diamond.position).toEqual({ x: 10, y: 160 });
    expect(diamond.points).toEqual([
      { x: 40, y: 0 },
      { x: 80, y: 40 },
      { x: 40, y: 80 },
      { x: 0, y: 40 },
    ]);
  });

  it("maps text with colour, alignment and monospace family", () => {
    const scene = importExcalidraw(fixture);
    const text = [...scene.elements.values()].find(isText) as TextElement;
    expect(text.text).toBe("Hello");
    expect(text.fontSize).toBe(20);
    expect(text.fontFamily).toBe("monospace");
    expect(text.style.fill).toBe("#1971c2");
    expect(text.style.textAlign).toBe("center");
  });

  it("maps freedraw pressures to per-point brush widths", () => {
    const scene = importExcalidraw(fixture);
    const brush = [...scene.elements.values()].find(isBrush) as BrushElement;
    // half-width = strokeWidth(2) × 2 × pressure
    expect(brush.points.map((p) => p.width)).toEqual([1, 2, 4]);
    expect(brush.points[0]).toMatchObject({ x: 0, y: 0 });
    expect(brush.position).toEqual({ x: 300, y: 200 });
  });

  it("maps bound arrows to anchor endpoints and free lines to point endpoints", () => {
    const scene = importExcalidraw(fixture);
    expect(scene.links.size).toBe(2);
    const arrow = [...scene.links.values()].find((l) => String(l.id) === "arrow1");
    expect(arrow?.from).toMatchObject({ kind: "anchor" });
    expect(arrow?.to).toMatchObject({ kind: "anchor" });
    expect(arrow?.routing).toBe("straight");
    expect(arrow?.arrowheads).toEqual({ to: "arrow" });

    const line = [...scene.links.values()].find((l) => String(l.id) === "line1");
    expect(line?.from).toEqual({ kind: "point", position: { x: 0, y: 300 } });
    expect(line?.to).toEqual({ kind: "point", position: { x: 50, y: 300 } });
    expect(line?.waypoints).toEqual([{ x: 25, y: 290 }]);
    expect(line?.arrowheads).toBeUndefined();
  });

  it("converts centre-based rotation to origin-based rotation", () => {
    const angle = Math.PI / 2;
    const scene = importExcalidraw(
      JSON.stringify({
        elements: [{ id: "r", type: "rectangle", x: 0, y: 0, width: 100, height: 50, angle }],
      }),
    );
    const rect = [...scene.elements.values()].find(isRectangle) as RectangleElement;
    expect(rect.rotation).toBeCloseTo(angle);
    // Centre must stay at (50, 25): origin = centre + R·(-50, -25).
    expect(rect.position.x).toBeCloseTo(50 + 25);
    expect(rect.position.y).toBeCloseTo(25 - 50);
  });

  it("flattens groupIds into one group element per outermost group", () => {
    const scene = importExcalidraw(
      JSON.stringify({
        elements: [
          {
            id: "a",
            type: "rectangle",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            groupIds: ["inner", "outer"],
          },
          { id: "b", type: "ellipse", x: 20, y: 0, width: 10, height: 10, groupIds: ["outer"] },
        ],
      }),
    );
    const groups = [...scene.elements.values()].filter(isGroup);
    expect(groups).toHaveLength(1);
    const a = [...scene.elements.values()].find((e) => String(e.id) === "a");
    const b = [...scene.elements.values()].find((e) => String(e.id) === "b");
    expect(a?.parentId).toBe(groups[0]?.id);
    expect(b?.parentId).toBe(groups[0]?.id);
  });

  it("skips unknown element types and deleted elements without throwing", () => {
    const scene = importExcalidraw(
      JSON.stringify({
        elements: [
          { id: "weird", type: "embeddable", x: 0, y: 0, width: 10, height: 10 },
          { id: "gone", type: "rectangle", x: 0, y: 0, width: 10, height: 10, isDeleted: true },
          { id: "ok", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
        ],
      }),
    );
    expect(scene.elements.size).toBe(1);
  });

  it("imports an empty file as an empty scene", () => {
    const scene = importExcalidraw("");
    expect(scene.elements.size).toBe(0);
    expect(scene.links.size).toBe(0);
  });

  it("imports a document without elements as an empty scene", () => {
    const scene = importExcalidraw("{}");
    expect(scene.elements.size).toBe(0);
  });

  it("throws a descriptive error on malformed JSON", () => {
    expect(() => importExcalidraw("{nope")).toThrow(/Invalid .excalidraw JSON/);
  });

  it("fits the viewport around the imported content", () => {
    const scene = importExcalidraw(fixture);
    expect(scene.viewport.size.width).toBeGreaterThan(340);
    expect(scene.viewport.size.height).toBeGreaterThan(240);
  });
});
