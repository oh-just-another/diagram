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

  // The tight-gap overlap renders as a smooth S whose step sits in the MIDDLE
  // (not a sharp reversal at a stub). The route must stay orthogonal, keep its
  // fixed stubs, and place any short reverse step away from the stub joints.
  it("tight-gap overlap is a mid-step S, not a buffer-side spike; stays orthogonal", () => {
    const isOrthogonal = (p: Vec2[]): boolean => {
      for (let i = 1; i < p.length; i++) {
        if (!(Math.abs(p[i]!.x - p[i - 1]!.x) < 1e-6 || Math.abs(p[i]!.y - p[i - 1]!.y) < 1e-6)) {
          return false;
        }
      }
      return true;
    };
    // No antiparallel reversal directly at a stub joint: the first two segments
    // after `from` must not reverse, nor the last two before `to`.
    const reversesAtStub = (p: Vec2[]): boolean => {
      const rev = (a: Vec2, b: Vec2, c: Vec2): boolean => {
        const abH = Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6;
        const bcH = Math.abs(b.y - c.y) < 1e-6 && Math.abs(b.x - c.x) > 1e-6;
        const abV = Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6;
        const bcV = Math.abs(b.x - c.x) < 1e-6 && Math.abs(b.y - c.y) > 1e-6;
        return (
          (abH && bcH && Math.sign(b.x - a.x) === -Math.sign(c.x - b.x)) ||
          (abV && bcV && Math.sign(b.y - a.y) === -Math.sign(c.y - b.y))
        );
      };
      return (
        (p.length >= 3 && rev(p[0]!, p[1]!, p[2]!)) ||
        (p.length >= 3 && rev(p[p.length - 3]!, p[p.length - 2]!, p[p.length - 1]!))
      );
    };
    // From above-left, to below-right.
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
    expect(reversesAtStub(zpath), `reverses at a stub: ${JSON.stringify(zpath)}`).toBe(false);

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

  // The terminal stub is a FIXED length (never shrinks). On tight gaps the two
  // fixed stubs overlap and the middle takes a smooth S; the stubs stay = 30.
  it("near-level bottom→top stubs stay fixed (never shrink)", () => {
    for (let gap = 36; gap <= 70; gap += 2) {
      let s = emptyScene();
      const a = rect("a", 225, 0, 300, 150); // bottom edge y=150, center x=375
      const b = rect("b", 720, 150 + gap, 400, 200); // top edge y=150+gap, center x=920
      ({ scene: s } = addElement(s, a));
      ({ scene: s } = addElement(s, b));
      const e: Link = {
        id: linkId("e3"),
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
      const fromBuf = path[1]!.y - 150; // first stub length
      const toBuf = 150 + gap - path[path.length - 2]!.y; // last stub length
      // Both stubs are exactly the buffer length (30), never shrunk.
      expect(Math.abs(fromBuf - 30), `from stub != 30 at gap=${gap}: ${fromBuf}`).toBeLessThan(0.6);
      expect(Math.abs(toBuf - 30), `to stub != 30 at gap=${gap}: ${toBuf}`).toBeLessThan(0.6);
    }
  });
});
