import { describe, expect, it } from "vitest";
import { linkId, layerId, elementId, type Vec2 } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  addLink,
  emptyScene,
  findLinkAt,
  getLinkCurvePoints,
  getLinkPath,
  getLinkWaypointMidpoints,
  orderBetween,
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

const named = (id: string, side: "top" | "right" | "bottom" | "left") => ({
  kind: "anchor" as const,
  elementId: elementId(id),
  anchor: { kind: "named" as const, name: side },
});

// ---------------------------------------------------------------------------
// Orthogonal routing — `routedPoints` verbatim + side-aware stub heuristic.
// ---------------------------------------------------------------------------
describe("getLinkPath — orthogonal routedPoints", () => {
  it("uses a defined routedPoints array verbatim (even when empty)", () => {
    const straight = edge({ routing: "orthogonal", routedPoints: [] });
    expect(getLinkPath(emptyScene(), straight)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);

    const withBends = edge({
      routing: "orthogonal",
      routedPoints: [{ x: 0, y: 100 }],
    });
    expect(getLinkPath(emptyScene(), withBends)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ]);
  });
});

describe("getLinkPath — orthogonal side-aware stub heuristic", () => {
  // No routedPoints → fall through to the exitDirection stub heuristic.
  it("from a 'right' anchor adds a rightward stub then bends", () => {
    const a = rect("a", 0, 0); // right edge midpoint = (100, 30)
    const e = edge({
      routing: "orthogonal",
      from: named("a", "right"),
      to: { kind: "point", position: { x: 400, y: 200 } },
    });
    const s = sceneWith([a], [e]);
    const path = getLinkPath(s, e)!;
    // First leg exits to the right of the anchor (x increases).
    expect(path[0]).toEqual({ x: 100, y: 30 });
    expect(path[1]!.x).toBeGreaterThan(100);
    expect(path[1]!.y).toBe(30);
    expect(path[path.length - 1]).toEqual({ x: 400, y: 200 });
  });

  it("from a 'top' anchor adds an upward stub (vertical-first bend)", () => {
    const a = rect("a", 0, 100); // top edge midpoint = (50, 100)
    const e = edge({
      routing: "orthogonal",
      from: named("a", "top"),
      to: { kind: "point", position: { x: 300, y: 0 } },
    });
    const s = sceneWith([a], [e]);
    const path = getLinkPath(s, e)!;
    expect(path[0]).toEqual({ x: 50, y: 100 });
    expect(path[1]!.x).toBe(50);
    expect(path[1]!.y).toBeLessThan(100); // stub goes up
  });

  it("both endpoints anchored ('bottom' → 'left') produce both stubs", () => {
    const a = rect("a", 0, 0); // bottom edge midpoint = (50, 60)
    const b = rect("b", 300, 200); // left edge midpoint = (300, 230)
    const e = edge({
      routing: "orthogonal",
      from: named("a", "bottom"),
      to: named("b", "left"),
    });
    const s = sceneWith([a, b], [e]);
    const path = getLinkPath(s, e)!;
    expect(path[0]).toEqual({ x: 50, y: 60 });
    // Second point is the bottom stub (y increases past 60).
    expect(path[1]!.y).toBeGreaterThan(60);
    // Last point is the left anchor; penultimate is its leftward stub.
    expect(path[path.length - 1]).toEqual({ x: 300, y: 230 });
    expect(path[path.length - 2]!.x).toBeLessThan(300);
  });

  it("'left' anchor with a target straight ahead omits the redundant bend", () => {
    // dx large, dy ~0 after the stub → the `|dx|>0.5 && |dy|>0.5` bend arm is
    // skipped (one of the bend guards is false).
    const a = rect("a", 100, 0); // left edge midpoint = (100, 30)
    const e = edge({
      routing: "orthogonal",
      from: named("a", "left"),
      to: { kind: "point", position: { x: -300, y: 30 } },
    });
    const s = sceneWith([a], [e]);
    const path = getLinkPath(s, e)!;
    expect(path[0]).toEqual({ x: 100, y: 30 });
    // All points stay on y = 30 (no vertical bend needed).
    for (const p of path) expect(p.y).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Self-loop polyline shapes: same-side staple, opposite-side wrap (both axes),
// perpendicular corner.
// ---------------------------------------------------------------------------
describe("self-loop polyline branch shapes", () => {
  const box = rect("a", 0, 0, 100, 60);

  it("same-side normals → 4-point staple", () => {
    // Both ends on the top side → n1 == n2 → `same` branch.
    const self = edge({
      from: named("a", "top"),
      to: named("a", "top"),
      routing: "orthogonal",
    });
    const s = sceneWith([box], [self]);
    const path = getLinkPath(s, self)!;
    expect(path).toHaveLength(4);
  });

  it("opposite vertical normals (top ↔ bottom) wrap around the +x side", () => {
    const self = edge({
      from: named("a", "top"),
      to: named("a", "bottom"),
      routing: "orthogonal",
    });
    const s = sceneWith([box], [self]);
    const path = getLinkPath(s, self)!;
    expect(path).toHaveLength(6);
    // Wraps past the right edge (x > width).
    expect(Math.max(...path.map((p) => p.x))).toBeGreaterThan(100);
  });

  it("opposite horizontal normals (left ↔ right) wrap around the +y side", () => {
    const self = edge({
      from: named("a", "left"),
      to: named("a", "right"),
      routing: "orthogonal",
    });
    const s = sceneWith([box], [self]);
    const path = getLinkPath(s, self)!;
    expect(path).toHaveLength(6);
    // Wraps past the bottom edge (y > height).
    expect(Math.max(...path.map((p) => p.y))).toBeGreaterThan(60);
  });

  it("perpendicular normals (top ↔ right) route through the outside corner", () => {
    const self = edge({
      from: named("a", "top"),
      to: named("a", "right"),
      routing: "orthogonal",
    });
    const s = sceneWith([box], [self]);
    const path = getLinkPath(s, self)!;
    expect(path).toHaveLength(5); // [p1, a1, corner, a2, p2]
  });
});

// ---------------------------------------------------------------------------
// findLinkAt — threshold miss + tie-break (later edge wins).
// ---------------------------------------------------------------------------
describe("findLinkAt branches", () => {
  it("returns null when no edge is within threshold", () => {
    const e = edge({
      from: { kind: "point", position: { x: 0, y: 0 } },
      to: { kind: "point", position: { x: 100, y: 0 } },
    });
    const s = sceneWith([], [e]);
    expect(findLinkAt(s, { x: 50, y: 500 }, 5)).toBeNull();
  });

  it("skips an edge whose path can't be resolved (continue arm)", () => {
    // floating endpoint referencing a missing shape → getLinkCurvePoints null.
    const broken = edge({
      from: { kind: "floating", elementId: elementId("ghost") },
      to: { kind: "point", position: { x: 100, y: 0 } },
    });
    const s = sceneWith([], [broken]);
    expect(findLinkAt(s, { x: 50, y: 0 }, 5)).toBeNull();
  });

  it("later edge wins a tie when two overlap (<=)", () => {
    const a = edge({
      id: linkId("first"),
      from: { kind: "point", position: { x: 0, y: 0 } },
      to: { kind: "point", position: { x: 100, y: 0 } },
    });
    const b = edge({
      id: linkId("second"),
      from: { kind: "point", position: { x: 0, y: 0 } },
      to: { kind: "point", position: { x: 100, y: 0 } },
    });
    const s = sceneWith([], [a, b]);
    const hit = findLinkAt(s, { x: 50, y: 0 }, 5);
    expect(hit?.id).toBe(linkId("second"));
  });
});

// ---------------------------------------------------------------------------
// getLinkWaypointMidpoints / getLinkCurvePoints — null arms.
// ---------------------------------------------------------------------------
describe("midpoint / curve null arms", () => {
  it("getLinkWaypointMidpoints returns null for orthogonal routing", () => {
    const e = edge({ routing: "orthogonal" });
    expect(getLinkWaypointMidpoints(emptyScene(), e)).toBeNull();
  });

  it("getLinkWaypointMidpoints returns null when the path is unresolvable", () => {
    const e = edge({
      from: { kind: "floating", elementId: elementId("ghost") },
    });
    expect(getLinkWaypointMidpoints(emptyScene(), e)).toBeNull();
  });

  it("getLinkWaypointMidpoints (straight) returns chord midpoints per span", () => {
    const e = edge({
      from: { kind: "point", position: { x: 0, y: 0 } },
      to: { kind: "point", position: { x: 100, y: 0 } },
      waypoints: [{ x: 50, y: 40 }],
    });
    const mids = getLinkWaypointMidpoints(emptyScene(), e)!;
    expect(mids).toHaveLength(2);
    expect(mids[0]).toEqual({ x: 25, y: 20 });
    expect(mids[1]).toEqual({ x: 75, y: 20 });
  });

  it("getLinkCurvePoints returns the straight path for non-bezier routing", () => {
    const e = edge({ routing: "straight" });
    const pts = getLinkCurvePoints(emptyScene(), e) as readonly Vec2[];
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
  });

  it("getLinkCurvePoints returns null when a bezier edge is unresolvable", () => {
    const e = edge({
      routing: "bezier",
      from: { kind: "floating", elementId: elementId("ghost") },
    });
    expect(getLinkCurvePoints(emptyScene(), e)).toBeNull();
  });
});
