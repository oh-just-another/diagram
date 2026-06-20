/**
 * Additional elbow-link tests targeting branches not covered by the existing
 * elbow-link.test.ts: routeElbowPreview, fixedSegments, point endpoints,
 * same-position endpoints, missing shapes, wrapRoute/midS collinear paths.
 */
import { describe, expect, it } from "vitest";
import { elementId, linkId } from "@oh-just-another/types";
import {
  addElement,
  addLink,
  DEFAULT_LAYER_ID,
  emptyScene,
  orderBetween,
  routeElbowLink,
  routeElbowPreview,
  type Link,
  type RectangleElement,
} from "../src/index";

const rect = (id: string, x: number, y: number, w = 80, h = 60): RectangleElement => ({
  id: elementId(id),
  layerId: DEFAULT_LAYER_ID,
  type: "rectangle",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: {},
  width: w,
  height: h,
});

const link = (from: Link["from"], to: Link["to"], extra?: Partial<Link>): Link => ({
  id: linkId("e"),
  layerId: DEFAULT_LAYER_ID,
  from,
  to,
  routing: "orthogonal",
  order: orderBetween(null, null),
  style: {},
  ...extra,
});

const build = (...shapes: RectangleElement[]) => {
  let s = emptyScene();
  for (const sh of shapes) ({ scene: s } = addElement(s, sh));
  return s;
};

const assertOrthogonal = (pts: readonly { x: number; y: number }[]) => {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6).toBe(true);
  }
};

// ---------------------------------------------------------------------------
// routeElbowLink — point-to-point (no shapes)
// ---------------------------------------------------------------------------
describe("routeElbowLink point endpoints", () => {
  it("routes between two free points with no obstacles", () => {
    const e = link(
      { kind: "point", position: { x: 0, y: 0 } },
      { kind: "point", position: { x: 200, y: 100 } },
    );
    const s = emptyScene();
    const pts = routeElbowLink(s, e);
    // result must be axis-aligned between consecutive points
    const full = [{ x: 0, y: 0 }, ...pts, { x: 200, y: 100 }];
    assertOrthogonal(full);
  });

  it("returns empty when from === to (same position)", () => {
    const e = link(
      { kind: "point", position: { x: 50, y: 50 } },
      { kind: "point", position: { x: 50, y: 50 } },
    );
    expect(routeElbowLink(emptyScene(), e)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// routeElbowLink — missing shape (anchor to non-existent element)
// ---------------------------------------------------------------------------
describe("routeElbowLink missing shape fallback", () => {
  it("returns empty when from endpoint references a missing element", () => {
    const e = link(
      { kind: "anchor", elementId: elementId("ghost"), anchor: { kind: "named", name: "right" } },
      { kind: "point", position: { x: 200, y: 0 } },
    );
    // No shapes added — ghost not found
    const pts = routeElbowLink(emptyScene(), e);
    // getLinkEndpointWorld returns null for missing element → returns []
    expect(pts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// routeElbowLink — collinear opposite stubs (top→bottom / bottom→top)
// ---------------------------------------------------------------------------
describe("routeElbowLink collinear stubs", () => {
  it("bottom→top separated: S-bend between top-centre and bottom-centre", () => {
    // a.bottom is at (40, 60); b.top is at (60, 300) — same axis, separated
    const a = rect("a", 0, 0, 80, 60);
    const b = rect("b", 20, 300, 80, 60);
    const e = link(
      { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "bottom" } },
      { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "top" } },
    );
    const s = build(a, b);
    const pts = routeElbowLink(s, e);
    assertOrthogonal([{ x: 40, y: 60 }, ...pts, { x: 60, y: 300 }]);
    expect(pts.length).toBeGreaterThanOrEqual(2);
  });

  it("right→left separated: Z-bend horizontal", () => {
    // a is at (0,0) 80×60 → right anchor at (80,30)
    // b is at (300,0) 80×60 → left anchor at (300,30)
    const a = rect("a", 0, 0, 80, 60);
    const b = rect("b", 300, 0, 80, 60);
    const e = link(
      { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
    );
    const s = build(a, b);
    const pts = routeElbowLink(s, e);
    assertOrthogonal([{ x: 80, y: 30 }, ...pts, { x: 300, y: 30 }]);
  });

  it("left→right separated: Z-bend horizontal (opposite direction)", () => {
    const a = rect("a", 300, 0, 80, 60);
    const b = rect("b", 0, 0, 80, 60);
    const e = link(
      { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "left" } },
      { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "right" } },
    );
    const s = build(a, b);
    const pts = routeElbowLink(s, e);
    assertOrthogonal([{ x: 300, y: 30 }, ...pts, { x: 80, y: 30 }]);
  });

  it("top→bottom: upward pair", () => {
    const a = rect("a", 0, 300, 80, 60);
    const b = rect("b", 20, 0, 80, 60);
    const e = link(
      { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "top" } },
      { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "bottom" } },
    );
    const s = build(a, b);
    const pts = routeElbowLink(s, e);
    assertOrthogonal([{ x: 40, y: 300 }, ...pts, { x: 60, y: 60 }]);
  });
});

// ---------------------------------------------------------------------------
// routeElbowLink — overlapping shapes (midS_ overlap branch)
// ---------------------------------------------------------------------------
describe("routeElbowLink overlapping shapes (overlap branch)", () => {
  it("bottom→top with vertically overlapping shapes still produces orthogonal route", () => {
    // Shapes overlap vertically: a.bottom=30, b.top=10 → buffers cross
    const a = rect("a", 0, 0, 80, 30);
    const b = rect("b", 20, 10, 80, 60); // b.top=10 < a.bottom=30 → overlap
    const e = link(
      { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "bottom" } },
      { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "top" } },
    );
    const s = build(a, b);
    const pts = routeElbowLink(s, e);
    // Just verify axis-alignment — may go through A* or wrapRoute
    const full = [{ x: 40, y: 30 }, ...pts, { x: 60, y: 10 }];
    assertOrthogonal(full);
  });
});

// ---------------------------------------------------------------------------
// routeElbowLink — fixedSegments
// ---------------------------------------------------------------------------
describe("routeElbowLink fixedSegments", () => {
  it("empty fixedSegments: same as no fixedSegments", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 300, 100);
    const e1 = link(
      { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
    );
    const e2 = link(
      { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
      { fixedSegments: [] },
    );
    const s = build(a, b);
    expect(routeElbowLink(s, e1)).toEqual(routeElbowLink(s, e2));
  });

  it("horizontal fixedSegment pins the cross-run y-coordinate", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 300, 0);
    // Simple right→left so there's a horizontal middle run
    const e = link(
      { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
      {
        fixedSegments: [{ axis: "h", pos: 80, at: 190 }], // pin the horizontal mid-run to y=80
      },
    );
    let s = emptyScene();
    ({ scene: s } = addElement(s, a));
    ({ scene: s } = addElement(s, b));
    ({ scene: s } = addLink(s, e));
    const pts = routeElbowLink(s, e);
    // With a horizontal segment pinned to y=80, at least one corner should have y≈80
    const hasY80 = pts.some((p) => Math.abs(p.y - 80) < 1);
    expect(hasY80).toBe(true);
    assertOrthogonal([{ x: 80, y: 30 }, ...pts, { x: 300, y: 30 }]);
  });

  it("vertical fixedSegment: result stays orthogonal", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 0, 300);
    const e = link(
      { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "bottom" } },
      { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "top" } },
      {
        fixedSegments: [{ axis: "v", pos: 120, at: 40 }], // pin vertical run to x=120
      },
    );
    let s = emptyScene();
    ({ scene: s } = addElement(s, a));
    ({ scene: s } = addElement(s, b));
    ({ scene: s } = addLink(s, e));
    const pts = routeElbowLink(s, e);
    const hasX120 = pts.some((p) => Math.abs(p.x - 120) < 1);
    expect(hasX120).toBe(true);
    assertOrthogonal([{ x: 40, y: 60 }, ...pts, { x: 40, y: 300 }]);
  });
});

// ---------------------------------------------------------------------------
// routeElbowPreview
// ---------------------------------------------------------------------------
describe("routeElbowPreview", () => {
  it("returns [from, to] when from === to", () => {
    const s = emptyScene();
    const result = routeElbowPreview(s, null, { x: 5, y: 5 }, null, { x: 5, y: 5 });
    expect(result).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]);
  });

  it("routes free (no elements): result starts with from and ends with to", () => {
    const s = emptyScene();
    const from = { x: 0, y: 0 };
    const to = { x: 200, y: 150 };
    const result = routeElbowPreview(s, null, from, null, to);
    expect(result[0]).toEqual(from);
    expect(result[result.length - 1]).toEqual(to);
    assertOrthogonal(result);
  });

  it("routes from an element endpoint toward a free point", () => {
    const a = rect("a", 0, 0);
    let s = emptyScene();
    ({ scene: s } = addElement(s, a));
    const from = { x: 80, y: 30 }; // right edge of a
    const to = { x: 300, y: 200 };
    const result = routeElbowPreview(s, elementId("a"), from, null, to);
    expect(result[0]).toEqual(from);
    expect(result[result.length - 1]).toEqual(to);
    assertOrthogonal(result);
  });

  it("routes between two elements: starts with from, ends with to", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 300, 200);
    let s = emptyScene();
    ({ scene: s } = addElement(s, a));
    ({ scene: s } = addElement(s, b));
    const from = { x: 80, y: 30 };
    const to = { x: 300, y: 230 };
    const result = routeElbowPreview(s, elementId("a"), from, elementId("b"), to);
    expect(result[0]).toEqual(from);
    expect(result[result.length - 1]).toEqual(to);
    assertOrthogonal(result);
  });

  it("missing element falls back to free-point heading", () => {
    const s = emptyScene(); // ghost element not added
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 100 };
    const result = routeElbowPreview(s, elementId("ghost"), from, null, to);
    expect(result[0]).toEqual(from);
    expect(result[result.length - 1]).toEqual(to);
  });
});

// ---------------------------------------------------------------------------
// routeElbowLink — L-shape (non-collinear ends: top→right etc.)
// ---------------------------------------------------------------------------
describe("routeElbowLink L-shape endpoints", () => {
  it("top→left: L-shaped path is orthogonal", () => {
    const a = rect("a", 0, 200);
    const b = rect("b", 300, 0);
    const e = link(
      { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "top" } },
      { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "left" } },
    );
    const s = build(a, b);
    const pts = routeElbowLink(s, e);
    assertOrthogonal([{ x: 40, y: 200 }, ...pts, { x: 300, y: 30 }]);
  });

  it("right→top: L-shaped path is orthogonal", () => {
    const a = rect("a", 0, 0);
    const b = rect("b", 200, 200);
    const e = link(
      { kind: "anchor", elementId: elementId("a"), anchor: { kind: "named", name: "right" } },
      { kind: "anchor", elementId: elementId("b"), anchor: { kind: "named", name: "top" } },
    );
    const s = build(a, b);
    const pts = routeElbowLink(s, e);
    assertOrthogonal([{ x: 80, y: 30 }, ...pts, { x: 240, y: 200 }]);
  });
});
