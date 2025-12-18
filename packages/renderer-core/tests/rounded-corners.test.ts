import { describe, expect, it, vi } from "vitest";
import { linkId, elementId } from "@oh-just-another/types";
import {
  addElement,
  addLink,
  emptyScene,
  DEFAULT_LAYER_ID,
  orderBetween,
  type Link,
  type Element,
} from "@oh-just-another/scene";
import { renderLinks } from "../src/index";

const rect = (id: string, x: number, y: number): Element => ({
  id: elementId(id), layerId: DEFAULT_LAYER_ID, type: "rectangle",
  position: { x, y }, rotation: 0, scale: { x: 1, y: 1 },
  order: orderBetween(null, null), style: { fill: "#000" }, width: 40, height: 40,
});

const stubTarget = () => ({
  save: vi.fn(), restore: vi.fn(), setFill: vi.fn(), setStroke: vi.fn(),
  setStrokeWidth: vi.fn(), setOpacity: vi.fn(), setLineCap: vi.fn(), setLineJoin: vi.fn(),
  setDashArray: vi.fn(), setFont: vi.fn(), setTextAlign: vi.fn(), setTextBaseline: vi.fn(),
  translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), setTransform: vi.fn(), resetTransform: vi.fn(),
  beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(), bezierCurveTo: vi.fn(), rect: vi.fn(), ellipse: vi.fn(),
  fill: vi.fn(), stroke: vi.fn(), fillText: vi.fn(), measureText: vi.fn(() => ({ width: 0 })),
  drawImage: vi.fn(), clear: vi.fn(), size: { width: 800, height: 600 },
});

describe("rounded link corners", () => {
  it("an elbow bend is drawn with a quadratic arc, not a sharp lineTo corner", () => {
    let s = emptyScene();
    s = addElement(s, rect("a", 0, 0)).scene; // right edge (40,20)
    s = addElement(s, rect("b", 200, 200)).scene;
    const e: Link = {
      id: linkId("e1"), layerId: DEFAULT_LAYER_ID, order: orderBetween(null, null),
      from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "top" } },
      routing: "orthogonal",
      // A pre-routed L: from (40,20) → corner (120,20) → (120,200)? use routedPoints.
      routedPoints: [{ x: 120, y: 20 }, { x: 120, y: 200 }],
      style: { stroke: "#000" },
    };
    s = addLink(s, e).scene;
    const target = stubTarget();
    renderLinks(s, target as never);
    // The interior corner(s) round → at least one quadratic arc emitted.
    expect(target.quadraticCurveTo).toHaveBeenCalled();
  });

  it("a straight 2-point link has no corners (no quadratic)", () => {
    let s = emptyScene();
    s = addElement(s, rect("a", 0, 0)).scene;
    s = addElement(s, rect("b", 200, 0)).scene;
    const e: Link = {
      id: linkId("e2"), layerId: DEFAULT_LAYER_ID, order: orderBetween(null, null),
      from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
      routing: "straight",
      style: { stroke: "#000" },
    };
    s = addLink(s, e).scene;
    const target = stubTarget();
    renderLinks(s, target as never);
    expect(target.quadraticCurveTo).not.toHaveBeenCalled();
  });
});
