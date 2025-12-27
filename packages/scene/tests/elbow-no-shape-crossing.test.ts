import { describe, it, expect } from "vitest";
import { elementId, linkId, layerId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  getLinkPath,
  orderBetween,
  routeElbowLink,
  updateLink,
  type Link,
  type RectangleElement,
  type Vec2,
} from "../src/index";

const rect = (id: string, x: number, y: number, w: number, h: number): RectangleElement => ({
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

// True if point p is strictly inside r (with a small inset to allow edge-touch).
const inside = (p: Vec2, r: RectangleElement, inset = 2): boolean =>
  p.x > r.position.x + inset &&
  p.x < r.position.x + r.width - inset &&
  p.y > r.position.y + inset &&
  p.y < r.position.y + r.height - inset;

const segCrosses = (a: Vec2, b: Vec2, r: RectangleElement): boolean => {
  for (let t = 0; t <= 1; t += 0.05) {
    if (inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, r)) return true;
  }
  return false;
};

describe("elbow route never crosses a bound shape", () => {
  // A `bottom`→`top` connector with the target above-right of the source must
  // route cleanly around both shapes for any drag position.
  it("a.bottom → b.top stays outside both shapes across positions", () => {
    for (let dx = -60; dx <= 60; dx += 5) {
      let s = emptyScene();
      const a = rect("a", 1234.5 + dx, -827.8, 234, 234);
      const b = rect("b", 1483.9, -701.5, 234, 234);
      ({ scene: s } = addElement(s, a));
      ({ scene: s } = addElement(s, b));
      const e: Link = {
        id: linkId("e"),
        layerId: layerId(DEFAULT_LAYER_ID),
        from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "bottom" } },
        to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "top" } },
        routing: "orthogonal",
        order: orderBetween(null, null),
        style: { stroke: "#000" },
      };
      ({ scene: s } = addLink(s, e));
      ({ scene: s } = updateLink(s, e.id, (x) => ({ ...x, routedPoints: routeElbowLink(s, e) })));
      const path = getLinkPath(s, [...s.links.values()][0]!)!;
      for (let i = 1; i < path.length; i++) {
        const crosses = segCrosses(path[i - 1]!, path[i]!, a) || segCrosses(path[i - 1]!, path[i]!, b);
        expect(crosses, `segment crosses a shape at dx=${dx}: ${JSON.stringify(path)}`).toBe(false);
      }
    }
  });
});
