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

  // The startHeading/endHeading router constraint stops the route from
  // retracing its terminal buffer. For a well-separated bottom→top connector
  // (target clearly below) no 180° buffer reversal should appear.
  it("a.bottom → b.top (separated) has no 180° buffer retrace", () => {
    const hasFold = (p: Vec2[]): boolean => {
      for (let i = 1; i < p.length - 1; i++) {
        const a = p[i - 1]!;
        const b = p[i]!;
        const c = p[i + 1]!;
        const abH = Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) > 1;
        const bcH = Math.abs(b.y - c.y) < 1 && Math.abs(b.x - c.x) > 1;
        const abV = Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) > 1;
        const bcV = Math.abs(b.x - c.x) < 1 && Math.abs(b.y - c.y) > 1;
        if (abH && bcH && Math.sign(b.x - a.x) === -Math.sign(c.x - b.x)) return true;
        if (abV && bcV && Math.sign(b.y - a.y) === -Math.sign(c.y - b.y)) return true;
      }
      return false;
    };
    for (let bx = 300; bx <= 900; bx += 50) {
      let s = emptyScene();
      const a = rect("a", 150, 0, 440, 170); // bottom edge y=170
      const b = rect("b", bx, 260, 435, 165); // top edge y=260, clearly below a
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
      expect(hasFold(path), `fold at bx=${bx}: ${JSON.stringify(path)}`).toBe(false);
    }

    // Near-level: when the vertical gap is < 2×buffer the two buffer levels
    // don't meet; trimBufferOvershoot must clamp the buffer so there's no tiny
    // reverse kink. Sweep gaps straddling 2×buffer (60).
    for (let gap = 40; gap <= 80; gap += 3) {
      let s = emptyScene();
      const a = rect("a", 0, 0, 300, 100); // bottom edge y=100
      const b = rect("b", 420, 100 + gap, 370, 150); // top edge y=100+gap
      ({ scene: s } = addElement(s, a));
      ({ scene: s } = addElement(s, b));
      const e: Link = {
        id: linkId("e2"),
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
      expect(hasFold(path), `near-level fold at gap=${gap}: ${JSON.stringify(path)}`).toBe(false);
    }
  });

  // A short mid-route jog (an S between two near-equal parallel runs) reads as
  // a sharp zigzag — straightenShortJogs must collapse it to one straight run,
  // while keeping the path orthogonal. Real offset steps (to reach an offset
  // shape) must stay. Counts short interior jogs (< ELBOW_MIN_SEGMENT) flanked
  // by parallel runs.
  it("collapses spurious short zigzag jogs but keeps real offset steps orthogonal", () => {
    const isOrthogonal = (p: Vec2[]): boolean => {
      for (let i = 1; i < p.length; i++) {
        if (!(Math.abs(p[i]!.x - p[i - 1]!.x) < 1e-6 || Math.abs(p[i]!.y - p[i - 1]!.y) < 1e-6)) {
          return false;
        }
      }
      return true;
    };
    const shortMidJogs = (p: Vec2[]): number => {
      let n = 0;
      for (let i = 2; i < p.length - 1; i++) {
        const stepLen = Math.hypot(p[i]!.x - p[i - 1]!.x, p[i]!.y - p[i - 1]!.y);
        if (stepLen >= 24 || stepLen < 1e-6) continue;
        const h1 = Math.abs(p[i - 2]!.y - p[i - 1]!.y) < 1e-6;
        const h2 = Math.abs(p[i]!.y - p[i + 1]!.y) < 1e-6;
        const v1 = Math.abs(p[i - 2]!.x - p[i - 1]!.x) < 1e-6;
        const v2 = Math.abs(p[i]!.x - p[i + 1]!.x) < 1e-6;
        const stepV = Math.abs(p[i - 1]!.x - p[i]!.x) < 1e-6;
        if (stepV && h1 && h2) n++; // vertical step between two horizontals
        if (!stepV && v1 && v2) n++; // horizontal step between two verticals
      }
      return n;
    };
    // Zigzag case from the captured log: from above-left, to below-right, the
    // two buffer levels differ by ~10px → a mid S.
    let s = emptyScene();
    const a = rect("a", 1091, -765, 300, 100); // bottom-center ≈ (1241,-665)
    const b = rect("b", 1403, -625, 300, 150); // top-center ≈ (1553,-625)
    ({ scene: s } = addElement(s, a));
    ({ scene: s } = addElement(s, b));
    const e: Link = {
      id: linkId("z"),
      layerId: layerId(DEFAULT_LAYER_ID),
      from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "bottom" } },
      to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "top" } },
      routing: "orthogonal",
      order: orderBetween(null, null),
      style: { stroke: "#000" },
    };
    ({ scene: s } = addLink(s, e));
    ({ scene: s } = updateLink(s, e.id, (x) => ({ ...x, routedPoints: routeElbowLink(s, e) })));
    const zpath = getLinkPath(s, [...s.links.values()][0]!)!;
    expect(isOrthogonal(zpath), `not orthogonal: ${JSON.stringify(zpath)}`).toBe(true);
    expect(shortMidJogs(zpath), `zigzag remains: ${JSON.stringify(zpath)}`).toBe(0);

    // Vertical stack with a real x-offset must KEEP its (necessary) step and
    // stay orthogonal.
    let s2 = emptyScene();
    const a2 = rect("a", 0, 0, 80, 60);
    const b2 = rect("b", 20, 300, 80, 60);
    ({ scene: s2 } = addElement(s2, a2));
    ({ scene: s2 } = addElement(s2, b2));
    const e2: Link = {
      id: linkId("vs"),
      layerId: layerId(DEFAULT_LAYER_ID),
      from: { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "bottom" } },
      to: { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "top" } },
      routing: "orthogonal",
      order: orderBetween(null, null),
      style: { stroke: "#000" },
    };
    ({ scene: s2 } = addLink(s2, e2));
    ({ scene: s2 } = updateLink(s2, e2.id, (x) => ({ ...x, routedPoints: routeElbowLink(s2, e2) })));
    const vpath = getLinkPath(s2, [...s2.links.values()][0]!)!;
    expect(isOrthogonal(vpath), `vstack not orthogonal: ${JSON.stringify(vpath)}`).toBe(true);
  });
});
