import { describe, expect, it, vi } from "vitest";
import { linkId, elementId } from "@oh-just-another/types";
import {
  addElement,
  addLink,
  emptyScene,
  DEFAULT_LAYER_ID,
  orderBetween,
  type ArrowheadStyle,
  type Link,
  type Element,
} from "@oh-just-another/scene";
import { renderLinks } from "../src/index";

const rect = (id: string, x: number, y: number): Element => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#000" },
  width: 20,
  height: 20,
});

const sceneWith = (head: ArrowheadStyle) => {
  let s = emptyScene();
  s = addElement(s, rect("a", 0, 0)).scene;
  s = addElement(s, rect("b", 200, 0)).scene;
  const edge: Link = {
    id: linkId("e1"),
    layerId: DEFAULT_LAYER_ID,
    order: orderBetween(null, null),
    from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
    to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
    style: { stroke: "#000" },
    arrowheads: { to: head },
  };
  return addLink(s, edge).scene;
};

const stubTarget = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  setFill: vi.fn(),
  setStroke: vi.fn(),
  setStrokeWidth: vi.fn(),
  setOpacity: vi.fn(),
  setLineCap: vi.fn(),
  setLineJoin: vi.fn(),
  setDashArray: vi.fn(),
  setFont: vi.fn(),
  setTextAlign: vi.fn(),
  setTextBaseline: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  setTransform: vi.fn(),
  resetTransform: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  rect: vi.fn(),
  ellipse: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  drawImage: vi.fn(),
  clear: vi.fn(),
  size: { width: 800, height: 600 },
});

const ALL: ArrowheadStyle[] = [
  "none",
  "arrow",
  "openArrow",
  "roundedArrow",
  "arcArrow",
  "triangle",
  "filledArrow",
  "circle",
  "filledCircle",
  "diamond",
  "rhombus",
  "filledRhombus",
  "erdOne",
  "erdOnlyOne",
  "erdMany",
  "erdOneOrMany",
  "erdZeroOrOne",
  "erdZeroOrMany",
];

describe("arrowhead rendering", () => {
  it("renders every arrowhead style without throwing", () => {
    for (const head of ALL) {
      const target = stubTarget();
      expect(() => renderLinks(sceneWith(head), target as never)).not.toThrow();
    }
  });

  it("filled caps call fill(); open/ERD caps stroke", () => {
    for (const head of ["filledArrow", "filledCircle", "filledRhombus"] as ArrowheadStyle[]) {
      const target = stubTarget();
      renderLinks(sceneWith(head), target as never);
      expect(target.fill).toHaveBeenCalled();
    }
    for (const head of ["openArrow", "erdMany", "erdZeroOrMany"] as ArrowheadStyle[]) {
      const target = stubTarget();
      renderLinks(sceneWith(head), target as never);
      expect(target.stroke).toHaveBeenCalled();
    }
  });

  it("crow's-foot (erdMany) draws more strokes than a plain bar (erdOne)", () => {
    const many = stubTarget();
    renderLinks(sceneWith("erdMany"), many as never);
    const one = stubTarget();
    renderLinks(sceneWith("erdOne"), one as never);
    expect(many.lineTo.mock.calls.length).toBeGreaterThan(one.lineTo.mock.calls.length);
  });
});
