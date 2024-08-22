import { describe, expect, it } from "vitest";
import { edgeId, layerId, shapeId } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addEdge,
  addShape,
  emptyScene,
  getEdgeEndpointWorld,
  getEdgePath,
  orderBetween,
  type Edge,
  type RectangleShape,
} from "../src/index";

const rect = (id: string, x: number, y: number, w = 100, h = 60): RectangleShape => ({
  id: shapeId(id),
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

const edge = (overrides: Partial<Edge>): Edge => ({
  id: edgeId("e1"),
  layerId: layerId(DEFAULT_LAYER_ID),
  from: { kind: "point", position: { x: 0, y: 0 } },
  to: { kind: "point", position: { x: 100, y: 100 } },
  order: orderBetween(null, null),
  style: { stroke: "#000" },
  ...overrides,
});

const sceneWith = (shapes: RectangleShape[], edges: Edge[] = []) => {
  let s = emptyScene();
  for (const sh of shapes) ({ scene: s } = addShape(s, sh));
  for (const e of edges) ({ scene: s } = addEdge(s, e));
  return s;
};

describe("getEdgeEndpointWorld", () => {
  it("returns the stored position for point endpoints", () => {
    const s = emptyScene();
    expect(getEdgeEndpointWorld(s, { kind: "point", position: { x: 42, y: 17 } })).toEqual({
      x: 42,
      y: 17,
    });
  });

  it("resolves anchor endpoints through the shape's transform", () => {
    const r = rect("a", 100, 200);
    const s = sceneWith([r]);
    expect(
      getEdgeEndpointWorld(s, {
        kind: "anchor",
        shapeId: r.id,
        anchor: { kind: "named", name: "center" },
      }),
    ).toEqual({ x: 150, y: 230 });
  });

  it("returns null when the referenced shape is missing", () => {
    const s = emptyScene();
    expect(
      getEdgeEndpointWorld(s, {
        kind: "anchor",
        shapeId: shapeId("ghost"),
        anchor: { kind: "named", name: "center" },
      }),
    ).toBeNull();
  });
});

describe("getEdgePath", () => {
  it("straight routing — [from, to]", () => {
    const e = edge({});
    expect(getEdgePath(emptyScene(), e)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
  });

  it("explicit waypoints are inserted between from and to regardless of routing", () => {
    const e = edge({ waypoints: [{ x: 50, y: 50 }] });
    const path = getEdgePath(emptyScene(), e);
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
    expect(getEdgePath(emptyScene(), e)).toEqual([
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
    expect(getEdgePath(emptyScene(), e)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 200 },
      { x: 50, y: 200 },
    ]);
  });

  it("bezier — same endpoints as straight, control points are renderer's job", () => {
    const e = edge({ routing: "bezier" });
    expect(getEdgePath(emptyScene(), e)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
  });

  it("returns null if either endpoint is missing", () => {
    const s = emptyScene();
    const e: Edge = edge({
      from: {
        kind: "anchor",
        shapeId: shapeId("missing"),
        anchor: { kind: "named", name: "center" },
      },
    });
    expect(getEdgePath(s, e)).toBeNull();
  });

  it("anchor-resolved endpoints react to shape movement", () => {
    const r = rect("x", 0, 0);
    const e: Edge = edge({
      from: { kind: "anchor", shapeId: r.id, anchor: { kind: "named", name: "right" } },
      to: { kind: "point", position: { x: 500, y: 0 } },
    });
    const s = sceneWith([r], [e]);
    expect(getEdgePath(s, e)).toEqual([
      { x: 100, y: 30 },
      { x: 500, y: 0 },
    ]);
  });
});
