import { describe, expect, it } from "vitest";
import { linkId, layerId, elementId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addLink,
  addElement,
  emptyScene,
  getLinkEndpointWorld,
  getLinkPath,
  orderBetween,
  type EllipseElement,
  type Link,
  type RectangleElement,
} from "../src/index";

const rect = (id: string, x: number, y: number, w = 100, h = 60): RectangleElement => ({
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

const edge = (overrides: Partial<Link>): Link => ({
  id: linkId("e1"),
  layerId: layerId(DEFAULT_LAYER_ID),
  from: { kind: "point", position: { x: 0, y: 0 } },
  to: { kind: "point", position: { x: 100, y: 100 } },
  order: orderBetween(null, null),
  style: { stroke: "#000" },
  ...overrides,
});

const sceneWith = (shapes: RectangleElement[], edges: Link[] = []) => {
  let s = emptyScene();
  for (const sh of shapes) ({ scene: s } = addElement(s, sh));
  for (const e of edges) ({ scene: s } = addLink(s, e));
  return s;
};

describe("getLinkEndpointWorld", () => {
  it("returns the stored position for point endpoints", () => {
    const s = emptyScene();
    expect(getLinkEndpointWorld(s, { kind: "point", position: { x: 42, y: 17 } })).toEqual({
      x: 42,
      y: 17,
    });
  });

  it("resolves anchor endpoints through the shape's transform", () => {
    const r = rect("a", 100, 200);
    const s = sceneWith([r]);
    expect(
      getLinkEndpointWorld(s, {
        kind: "anchor",
        elementId: r.id,
        anchor: { kind: "named", name: "center" },
      }),
    ).toEqual({ x: 150, y: 230 });
  });

  it("returns null when the referenced shape is missing", () => {
    const s = emptyScene();
    expect(
      getLinkEndpointWorld(s, {
        kind: "anchor",
        elementId: elementId("ghost"),
        anchor: { kind: "named", name: "center" },
      }),
    ).toBeNull();
  });
});

describe("getLinkPath", () => {
  it("straight routing — [from, to]", () => {
    const e = edge({});
    expect(getLinkPath(emptyScene(), e)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
  });

  it("explicit waypoints are inserted between from and to regardless of routing", () => {
    const e = edge({ waypoints: [{ x: 50, y: 50 }] });
    const path = getLinkPath(emptyScene(), e);
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 100 },
    ]);
  });

  it("orthogonal — elbow goes horizontal first when dx >= dy", () => {
    const e = edge({
      routing: "orthogonal",
      to: { kind: "point", position: { x: 200, y: 50 } },
    });
    expect(getLinkPath(emptyScene(), e)).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 50 },
    ]);
  });

  it("orthogonal — elbow goes vertical first when dy > dx", () => {
    const e = edge({
      routing: "orthogonal",
      to: { kind: "point", position: { x: 50, y: 200 } },
    });
    expect(getLinkPath(emptyScene(), e)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 200 },
      { x: 50, y: 200 },
    ]);
  });

  it("bezier — same endpoints as straight, control points are renderer's job", () => {
    const e = edge({ routing: "bezier" });
    expect(getLinkPath(emptyScene(), e)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
  });

  it("returns null if either endpoint is missing", () => {
    const s = emptyScene();
    const e: Link = edge({
      from: {
        kind: "anchor",
        elementId: elementId("missing"),
        anchor: { kind: "named", name: "center" },
      },
    });
    expect(getLinkPath(s, e)).toBeNull();
  });

  it("anchor-resolved endpoints react to shape movement", () => {
    const r = rect("x", 0, 0);
    const e: Link = edge({
      from: { kind: "anchor", elementId: r.id, anchor: { kind: "named", name: "right" } },
      to: { kind: "point", position: { x: 500, y: 0 } },
    });
    const s = sceneWith([r], [e]);
    expect(getLinkPath(s, e)).toEqual([
      { x: 100, y: 30 },
      { x: 500, y: 0 },
    ]);
  });
});

const ellipse = (id: string, x: number, y: number, w = 100, h = 60): EllipseElement => ({
  id: elementId(id),
  layerId: layerId(DEFAULT_LAYER_ID),
  type: "ellipse",
  position: { x, y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#fff" },
  width: w,
  height: h,
});

const closeTo = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 3);
  expect(p.y).toBeCloseTo(y, 3);
};

describe("floating endpoints", () => {
  // rect "a" at origin: bounds 0..100 × 0..60, centre (50, 30).
  it("getLinkEndpointWorld without `toward` falls back to the shape centre", () => {
    const r = rect("a", 0, 0);
    const s = sceneWith([r]);
    expect(getLinkEndpointWorld(s, { kind: "floating", elementId: r.id })).toEqual({ x: 50, y: 30 });
  });

  it("resolves to the perimeter point on the side facing the partner", () => {
    const r = rect("a", 0, 0);
    const e: Link = edge({
      from: { kind: "floating", elementId: r.id },
      to: { kind: "point", position: { x: 500, y: 30 } },
    });
    const s = sceneWith([r], [e]);
    const path = getLinkPath(s, e)!;
    closeTo(path[0]!, 100, 30); // exits the right edge toward the partner
    closeTo(path[1]!, 500, 30);
  });

  it("slides along the perimeter when the partner moves to another side", () => {
    const r = rect("a", 0, 0);
    const e: Link = edge({
      from: { kind: "floating", elementId: r.id },
      to: { kind: "point", position: { x: 50, y: 500 } },
    });
    const s = sceneWith([r], [e]);
    const path = getLinkPath(s, e)!;
    closeTo(path[0]!, 50, 60); // now exits the bottom edge
  });

  it("follows when its own shape moves", () => {
    const moved = rect("a", 200, 0); // centre (250, 30)
    const e: Link = edge({
      from: { kind: "floating", elementId: moved.id },
      to: { kind: "point", position: { x: 1000, y: 30 } },
    });
    const s = sceneWith([moved], [e]);
    closeTo(getLinkPath(s, e)![0]!, 300, 30); // right edge of the moved rect
  });

  it("both endpoints floating — each exits toward the other shape's centre", () => {
    const a = rect("a", 0, 0); // centre (50, 30), right edge x=100
    const b = rect("b", 200, 0); // centre (250, 30), left edge x=200
    const e: Link = edge({
      from: { kind: "floating", elementId: a.id },
      to: { kind: "floating", elementId: b.id },
    });
    const s = sceneWith([a, b], [e]);
    const path = getLinkPath(s, e)!;
    closeTo(path[0]!, 100, 30);
    closeTo(path[1]!, 200, 30);
  });

  it("works for ellipse outlines", () => {
    const el = ellipse("e", 0, 0); // centre (50, 30), rx=50 ry=30
    const e: Link = edge({
      from: { kind: "floating", elementId: el.id },
      to: { kind: "point", position: { x: 500, y: 30 } },
    });
    let s = emptyScene();
    ({ scene: s } = addElement(s, el));
    ({ scene: s } = addLink(s, e));
    closeTo(getLinkPath(s, e)![0]!, 100, 30); // rightmost point of the ellipse
  });
});
