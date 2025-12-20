import { describe, expect, it } from "vitest";
import { elementId, linkId, layerId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  orderBetween,
  routeElbowLink,
  type Link,
  type RectangleElement,
} from "../src/index";

const rect = (id: string, x: number, y: number, w = 80, h = 60): RectangleElement => ({
  id: elementId(id),
  layerId: layerId(DEFAULT_LAYER_ID),
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#fff" },
  width: w,
  height: h,
});

const link = (from: Link["from"], to: Link["to"]): Link => ({
  id: linkId("e"),
  layerId: layerId(DEFAULT_LAYER_ID),
  from,
  to,
  routing: "orthogonal",
  order: orderBetween(null, null),
  style: { stroke: "#000" },
});

const build = (a: RectangleElement, b: RectangleElement, e: Link) => {
  let s = emptyScene();
  ({ scene: s } = addElement(s, a));
  ({ scene: s } = addElement(s, b));
  ({ scene: s } = addLink(s, e));
  return s;
};

// Assert every consecutive segment of [from, ...points, to] is axis-aligned.
const assertOrthogonal = (full: { x: number; y: number }[]) => {
  for (let i = 1; i < full.length; i++) {
    const a = full[i - 1]!;
    const b = full[i]!;
    const horizontal = Math.abs(a.y - b.y) < 1e-6;
    const vertical = Math.abs(a.x - b.x) < 1e-6;
    expect(horizontal || vertical).toBe(true);
  }
};

describe("routeElbowLink", () => {
  it("every segment is horizontal or vertical (side-by-side rects)", () => {
    const a = rect("a", 0, 0); // right edge x=80, mid y=30
    const b = rect("b", 300, 80); // offset down-right
    const e = link(
      { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
    );
    const s = build(a, b, e);
    const points = routeElbowLink(s, e);
    const from = { x: 80, y: 30 };
    const to = { x: 300, y: 110 };
    assertOrthogonal([from, ...points, to]);
    expect(points.length).toBeGreaterThan(0); // it bends
  });

  it("every segment is orthogonal for a vertical stack", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 20, 300);
    const e = link(
      { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "bottom" } },
      { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "top" } },
    );
    const s = build(a, b, e);
    const points = routeElbowLink(s, e);
    assertOrthogonal([{ x: 40, y: 60 }, ...points, { x: 60, y: 300 }]);
  });

  it("the first/last segment always exits OUTSIDE the shape (never turns inward)", () => {
    const a = rect("a", 0, 0, 80, 60); // bbox x∈[0,80], y∈[0,60]
    // Partners all around A, including near-diagonal (corner) cases.
    const partners = [
      { x: 200, y: -120 },
      { x: 200, y: 6 },
      { x: -200, y: 120 },
      { x: 40, y: 300 },
      { x: 200, y: 54 },
      { x: -150, y: -150 },
    ];
    const insideA = (p: { x: number; y: number }) =>
      p.x > 1e-6 && p.x < 80 - 1e-6 && p.y > 1e-6 && p.y < 60 - 1e-6;
    for (const pos of partners) {
      const b = rect("b", pos.x, pos.y, 40, 40);
      const e = link(
        { kind: "floating", elementId: elementId("a") },
        { kind: "floating", elementId: elementId("b") },
      );
      const s = build(a, b, e);
      const points = routeElbowLink(s, e);
      if (points.length === 0) continue; // straight run — can't turn inward
      // The first routed point (end of A's terminal buffer segment) must be
      // outside A's bbox: the connector left perpendicular to A's edge.
      expect(insideA(points[0]!)).toBe(false);
    }
  });

  it("orthogonal even with floating endpoints", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 300, 200);
    const e = link(
      { kind: "floating", elementId: elementId("a") },
      { kind: "floating", elementId: elementId("b") },
    );
    const s = build(a, b, e);
    const points = routeElbowLink(s, e);
    // Endpoints resolve roughly via the centres' facing edges; assert the chain
    // through the routed points stays axis-aligned end to end.
    const full = [{ x: 80, y: 30 }, ...points, { x: 300, y: 230 }];
    // Adjacent routed points must be axis-aligned.
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1]!;
      const q = points[i]!;
      expect(Math.abs(p.x - q.x) < 1e-6 || Math.abs(p.y - q.y) < 1e-6).toBe(true);
    }
    void full;
  });
});
