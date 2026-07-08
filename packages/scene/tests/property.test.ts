import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  elementId,
  layerId,
  linkId,
  req,
  type Bounds,
  type ElementId,
  type Vec2,
} from "@oh-just-another/types";
import { bounds as mbounds } from "@oh-just-another/math";
import {
  DEFAULT_LAYER_ID,
  ELBOW_OBSTACLE_INTERIOR_EPSILON,
  ELBOW_OBSTACLE_MARGIN,
  SpatialGrid,
  addElement,
  addLink,
  elbowRoute,
  emptyScene,
  getLinkEndpointWorld,
  getLinkPath,
  orderBetween,
  routeElbowLink,
  type Link,
  type RectangleElement,
} from "../src/index";

/**
 * Property-based invariants (fast-check) for the scene routing + spatial-index
 * layer. These assert structural guarantees (axis-aligned segments, endpoint
 * fidelity, obstacle avoidance, spatial-query completeness) over arbitrary
 * geometry rather than a handful of hand-picked cases.
 */

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const coord = (): fc.Arbitrary<number> => fc.integer({ min: -2000, max: 2000 });

const point = (): fc.Arbitrary<Vec2> => fc.record({ x: coord(), y: coord() });

const boundArb = (): fc.Arbitrary<Bounds> =>
  fc.record({
    x: coord(),
    y: coord(),
    width: fc.integer({ min: 1, max: 500 }),
    height: fc.integer({ min: 1, max: 500 }),
  });

/** Bounds guaranteed not to contain either `from` or `to` (interior). */
const obstacleAvoiding = (from: Vec2, to: Vec2): fc.Arbitrary<Bounds> =>
  boundArb().filter((b) => !interiorContains(b, from) && !interiorContains(b, to));

const interiorContains = (b: Bounds, p: Vec2): boolean =>
  p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height;

let seq = 0;
const rect = (b: Bounds): RectangleElement => ({
  id: elementId(`r${(seq++).toString()}`),
  layerId: layerId(DEFAULT_LAYER_ID),
  type: "rectangle",
  position: { x: b.x, y: b.y },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { fill: "#fff" },
  width: b.width,
  height: b.height,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EPS = 1e-6;

/** Every consecutive segment of a polyline is horizontal OR vertical. */
const isAxisAligned = (path: readonly Vec2[]): boolean => {
  for (let i = 1; i < path.length; i++) {
    const a = req(path[i - 1]);
    const b = req(path[i]);
    const horizontal = Math.abs(a.y - b.y) < EPS;
    const vertical = Math.abs(a.x - b.x) < EPS;
    if (!horizontal && !vertical) return false;
  }
  return true;
};

const inflate = (b: Bounds, m: number): Bounds => ({
  x: b.x - m,
  y: b.y - m,
  width: b.width + 2 * m,
  height: b.height + 2 * m,
});

/**
 * True if the segment `p→q` passes DEEP through the interior of `infl` — i.e.
 * a sampled point sits strictly inside by more than `eps`. Running ALONG the
 * inflated boundary is allowed (that's the margin's purpose), so points within
 * `eps` of an edge don't count as a crossing.
 */
const segmentPierces = (p: Vec2, q: Vec2, infl: Bounds, eps: number): boolean => {
  const maxXb = infl.x + infl.width;
  const maxYb = infl.y + infl.height;
  const STEPS = 64;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const x = p.x + (q.x - p.x) * t;
    const y = p.y + (q.y - p.y) * t;
    if (x > infl.x + eps && x < maxXb - eps && y > infl.y + eps && y < maxYb - eps) {
      return true;
    }
  }
  return false;
};

// ---------------------------------------------------------------------------
// elbowRoute (pure A* router)
// ---------------------------------------------------------------------------

describe("elbowRoute — property invariants", () => {
  it("endpoints match the request and every segment is axis-aligned", () => {
    fc.assert(
      fc.property(
        point(),
        point(),
        fc.array(boundArb(), { maxLength: 4 }),
        (from, to, obstacles) => {
          const route = elbowRoute(from, to, obstacles);
          fc.pre(route !== null && route.length >= 1);
          const r = req(route);
          expect(r[0]).toEqual(from);
          expect(r[r.length - 1]).toEqual(to);
          expect(isAxisAligned(r)).toBe(true);
        },
      ),
    );
  });

  it("never pierces the interior of an inflated obstacle (same margin constant)", () => {
    // Generate from/to first, then obstacles that don't enclose either end
    // (an endpoint inside an obstacle would legitimately sit in the interior).
    const scenario = fc
      .tuple(point(), point())
      .filter(([from, to]) => from.x !== to.x || from.y !== to.y)
      .chain(([from, to]) =>
        fc
          .array(obstacleAvoiding(from, to), { maxLength: 3 })
          .map((obstacles) => ({ from, to, obstacles })),
      );
    fc.assert(
      fc.property(scenario, ({ from, to, obstacles }) => {
        const route = elbowRoute(from, to, obstacles);
        fc.pre(route !== null && route.length >= 2);
        const r = req(route);
        const eps = ELBOW_OBSTACLE_INTERIOR_EPSILON;
        for (const o of obstacles) {
          const infl = inflate(o, ELBOW_OBSTACLE_MARGIN);
          for (let i = 1; i < r.length; i++) {
            expect(segmentPierces(req(r[i - 1]), req(r[i]), infl, eps)).toBe(false);
          }
        }
      }),
    );
  });

  it("returns [from] for a degenerate (same-point) request", () => {
    fc.assert(
      fc.property(point(), fc.array(boundArb(), { maxLength: 3 }), (p, obstacles) => {
        expect(elbowRoute(p, p, obstacles)).toEqual([p]);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// routeElbowLink (scene-integrated elbow)
// ---------------------------------------------------------------------------

describe("routeElbowLink — property invariants", () => {
  const sides = ["top", "bottom", "left", "right"] as const;

  it("the full path [from, ...corners, to] is axis-aligned and ends at the resolved endpoints", () => {
    fc.assert(
      fc.property(
        boundArb(),
        boundArb(),
        fc.constantFrom(...sides),
        fc.constantFrom(...sides),
        (ba, bb, sideA, sideB) => {
          const a = rect(ba);
          const b = rect(bb);
          let scene = emptyScene();
          ({ scene } = addElement(scene, a));
          ({ scene } = addElement(scene, b));
          const link: Link = {
            id: linkId("l1"),
            layerId: layerId(DEFAULT_LAYER_ID),
            from: { kind: "anchor", elementId: a.id, anchor: { kind: "named", name: sideA } },
            to: { kind: "anchor", elementId: b.id, anchor: { kind: "named", name: sideB } },
            order: orderBetween(null, null),
            style: { stroke: "#000" },
            routing: "orthogonal",
          };
          ({ scene } = addLink(scene, link));

          const fromW = getLinkEndpointWorld(scene, link.from);
          const toW = getLinkEndpointWorld(scene, link.to);
          fc.pre(fromW !== null && toW !== null);
          const mid = routeElbowLink(scene, link);
          fc.pre(mid.length > 0); // [] means degenerate (coincident endpoints)

          const full: Vec2[] = [req(fromW), ...mid, req(toW)];
          expect(isAxisAligned(full)).toBe(true);
          expect(full[0]).toEqual(fromW);
          expect(full[full.length - 1]).toEqual(toW);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// getLinkPath (edge geometry)
// ---------------------------------------------------------------------------

describe("getLinkPath — property invariants", () => {
  const pointLink = (from: Vec2, to: Vec2, extra: Partial<Link>): Link => ({
    id: linkId("g1"),
    layerId: layerId(DEFAULT_LAYER_ID),
    from: { kind: "point", position: from },
    to: { kind: "point", position: to },
    order: orderBetween(null, null),
    style: { stroke: "#000" },
    ...extra,
  });

  it("straight routing: path is exactly [from, ...waypoints, to]", () => {
    fc.assert(
      fc.property(point(), point(), fc.array(point(), { maxLength: 4 }), (from, to, waypoints) => {
        const scene = emptyScene();
        const link = pointLink(from, to, { routing: "straight", waypoints });
        const p = getLinkPath(scene, link);
        if (p === null) throw new Error("point endpoints always resolve");
        expect(p[0]).toEqual(from);
        expect(p[p.length - 1]).toEqual(to);
        expect(p.slice(1, -1)).toEqual(waypoints);
      }),
    );
  });

  it("orthogonal routing (point ends, no stored route): axis-aligned, keeps endpoints", () => {
    fc.assert(
      fc.property(point(), point(), (from, to) => {
        const scene = emptyScene();
        const link = pointLink(from, to, { routing: "orthogonal" });
        const p = getLinkPath(scene, link);
        if (p === null) throw new Error("point endpoints always resolve");
        expect(p[0]).toEqual(from);
        expect(p[p.length - 1]).toEqual(to);
        expect(isAxisAligned(p)).toBe(true);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// SpatialGrid (uniform-cell index)
// ---------------------------------------------------------------------------

describe("SpatialGrid — property invariants", () => {
  it("query(range) is a complete superset: every truly-intersecting shape is returned", () => {
    fc.assert(
      fc.property(
        fc.array(boundArb(), { minLength: 0, maxLength: 30 }),
        boundArb(),
        fc.integer({ min: 16, max: 1024 }),
        (shapes, range, cellSize) => {
          const grid = new SpatialGrid(cellSize);
          const ids: ElementId[] = [];
          shapes.forEach((b, i) => {
            const id = elementId(`s${i.toString()}`);
            ids.push(id);
            grid.insert(id, b);
          });

          const queried = grid.query(range);
          // Brute-force truth: strict interior intersection ⇒ must be returned.
          shapes.forEach((b, i) => {
            if (mbounds.intersects(b, range)) {
              expect(queried.has(req(ids[i]))).toBe(true);
            }
          });
          // Soundness: never returns an id that was not inserted.
          for (const id of queried) expect(ids.includes(id)).toBe(true);
        },
      ),
    );
  });

  it("size tracks inserts and removes", () => {
    fc.assert(
      fc.property(fc.array(boundArb(), { minLength: 1, maxLength: 20 }), (shapes) => {
        const grid = new SpatialGrid(128);
        const ids = shapes.map((b, i) => {
          const id = elementId(`t${i.toString()}`);
          grid.insert(id, b);
          return id;
        });
        expect(grid.size).toBe(shapes.length);
        grid.remove(req(ids[0]));
        expect(grid.size).toBe(shapes.length - 1);
      }),
    );
  });
});
