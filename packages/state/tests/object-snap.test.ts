import { describe, expect, it } from "vitest";
import {
  alignmentGuides,
  composeAxisDeltas,
  gapIntervals,
  snapMoveDeltaToObjects,
  snapResizeDeltaToObjects,
  snappedAxes,
  rebaseGuides,
} from "../src/editor/applies/object-snap.js";

const b = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe("snapMoveDeltaToObjects", () => {
  it("snaps the moved shape's left edge to a neighbour's right edge and emits a guide", () => {
    // Moving 50×50 from (0,0) by +103 → left edge at 103; neighbour's right edge at 100.
    const r = snapMoveDeltaToObjects(b(0, 0, 50, 50), { x: 103, y: 0 }, [b(50, 200, 50, 50)], 6);
    expect(r.delta).toEqual({ x: 100, y: 0 });
    expect(r.guides).toEqual([
      {
        axis: "x",
        at: 100,
        from: 0,
        to: 250,
        kind: "edge",
        moving: b(100, 0, 50, 50),
        other: b(50, 200, 50, 50),
      },
    ]);
  });

  it("snaps centres and both axes independently (closest line wins per axis)", () => {
    // Neighbour 60×60 at (100,100): centre (130,130). Moving 50×50 after delta:
    // x lines 103 / 153 / centre 128 → centre (2 px) beats the left edge (3 px);
    // y lines 97 / 147 / centre 122 → top edge (3 px) beats the centre (8 px).
    const r = snapMoveDeltaToObjects(b(0, 0, 50, 50), { x: 103, y: 97 }, [b(100, 100, 60, 60)], 6);
    expect(r.delta).toEqual({ x: 105, y: 100 });
    expect(r.guides).toMatchObject([
      { axis: "x", at: 130, kind: "center" },
      { axis: "y", at: 100, kind: "edge" },
    ]);
  });

  it("never pairs an edge with a centre while moving; a multi-selection offers no centre", () => {
    // Moving 50×50 → left edge at 122; neighbour centre at 125: edge↔centre must NOT snap.
    const noPair = snapMoveDeltaToObjects(
      b(0, 0, 50, 50),
      { x: 122, y: 300 },
      [b(100, 0, 50, 50)],
      6,
    );
    expect(noPair.guides).toEqual([]);
    // Centre↔centre (128 vs 130, 2 px) beats edge↔edge (103 vs 100, 3 px)…
    const centre = snapMoveDeltaToObjects(
      b(0, 0, 50, 50),
      { x: 103, y: 300 },
      [b(100, 0, 60, 60)],
      6,
    );
    expect(centre.guides).toMatchObject([{ axis: "x", kind: "center", at: 130 }]);
    // …unless the mover is a multi-selection frame, which has edges only.
    const frame = snapMoveDeltaToObjects(
      b(0, 0, 50, 50),
      { x: 103, y: 300 },
      [b(100, 0, 60, 60)],
      6,
      {
        centerLines: false,
      },
    );
    expect(frame.guides).toMatchObject([{ axis: "x", kind: "edge", at: 100 }]);
  });

  it("leaves the delta alone beyond the threshold or without neighbours", () => {
    expect(
      snapMoveDeltaToObjects(b(0, 0, 50, 50), { x: 110, y: 0 }, [b(50, 300, 50, 50)], 6),
    ).toEqual({ delta: { x: 110, y: 0 }, guides: [] });
    expect(snapMoveDeltaToObjects(b(0, 0, 50, 50), { x: 3, y: 3 }, [], 6).delta).toEqual({
      x: 3,
      y: 3,
    });
  });
});

describe("snapResizeDeltaToObjects", () => {
  const opts = { alignEdges: true, matchSizes: true };

  it("aligns the dragged east edge with a neighbour's edge; stationary edges stay", () => {
    // Dragging `e` by +47 → right edge 97; neighbour left edge at 100.
    const r = snapResizeDeltaToObjects(
      b(0, 0, 50, 50),
      "e",
      { x: 47, y: 0 },
      [b(100, 0, 40, 40)],
      6,
      opts,
    );
    expect(r.delta).toEqual({ x: 50, y: 0 });
    expect(r.guides).toMatchObject([{ axis: "x", at: 100, from: 0, to: 50, kind: "edge" }]);
    expect(r.sizeMatch).toBeNull();
  });

  it("suggests a neighbour's width when the raw width is close to it", () => {
    // Dragging `e` by +33 → width 83; neighbour width 80 (its edges are far away).
    const other = b(500, 500, 80, 30);
    const r = snapResizeDeltaToObjects(b(0, 0, 50, 50), "e", { x: 33, y: 0 }, [other], 6, opts);
    expect(r.delta).toEqual({ x: 30, y: 0 });
    expect(r.sizeMatch).toEqual({ bounds: other, axis: "width" });
    expect(r.guides).toEqual([]);
  });

  it("only snaps the axes the handle controls and honours the option flags", () => {
    const other = b(500, 500, 80, 30);
    // `s` drags height only: width suggestion must not apply.
    const s = snapResizeDeltaToObjects(b(0, 0, 50, 50), "s", { x: 33, y: -22 }, [other], 6, opts);
    expect(s.delta).toEqual({ x: 33, y: -20 }); // height 50−22=28 → 30
    expect(s.sizeMatch).toEqual({ bounds: other, axis: "height" });
    const off = snapResizeDeltaToObjects(b(0, 0, 50, 50), "s", { x: 33, y: -22 }, [other], 6, {
      alignEdges: true,
      matchSizes: false,
    });
    expect(off.delta).toEqual({ x: 33, y: -22 });
  });
});

describe("gapIntervals", () => {
  it("returns the gap between disjoint extents, the two stretches of a partial overlap, nothing when nested", () => {
    expect(gapIntervals(0, 40, 100, 140)).toEqual([{ start: 40, end: 100 }]);
    expect(gapIntervals(100, 140, 0, 40)).toEqual([{ start: 40, end: 100 }]);
    expect(gapIntervals(0, 40, 20, 60)).toEqual([
      { start: 0, end: 20 },
      { start: 40, end: 60 },
    ]);
    expect(gapIntervals(0, 100, 20, 60)).toEqual([]);
    expect(gapIntervals(0, 40, 0, 40)).toEqual([]);
  });
});

describe("snappedAxes / composeAxisDeltas", () => {
  it("reads the corrected axes off the guides", () => {
    expect(snappedAxes([])).toEqual({ x: false, y: false });
    const r = snapMoveDeltaToObjects(b(0, 0, 50, 50), { x: 103, y: 0 }, [b(50, 200, 50, 50)], 6);
    expect(snappedAxes(r.guides)).toEqual({ x: true, y: false });
  });

  it("takes the object delta on covered axes and the grid delta elsewhere", () => {
    const object = { x: 100, y: 13 };
    const grid = { x: 105, y: 10 };
    expect(composeAxisDeltas(object, { x: true, y: false }, grid)).toEqual({ x: 100, y: 10 });
    expect(composeAxisDeltas(object, { x: false, y: true }, grid)).toEqual({ x: 105, y: 13 });
    expect(composeAxisDeltas(object, { x: true, y: true }, grid)).toEqual(object);
  });
});

describe("alignmentGuides / rebaseGuides", () => {
  it("reports an existing alignment within epsilon, and nothing beyond it", () => {
    // Left edges both at 100 → an x guide; y extents are far apart.
    const g = alignmentGuides(b(100, 0, 50, 50), [b(100, 200, 50, 50)], 0.5);
    expect(g).toMatchObject([{ axis: "x", at: 100, kind: "edge", moving: b(100, 0, 50, 50) }]);
    expect(alignmentGuides(b(101, 0, 50, 50), [b(100, 200, 50, 50)], 0.5)).toEqual([]);
    expect(alignmentGuides(b(100, 0, 50, 50), [], 0.5)).toEqual([]);
  });

  it("honours the no-centre-lines option of a multi-selection", () => {
    // The moved frame's centre (125) meets the other's centre (125).
    const others = [b(100, 200, 50, 50)];
    expect(alignmentGuides(b(100, 0, 50, 50), others, 0.5)).toHaveLength(1);
    const noCentre = alignmentGuides(b(75, 0, 100, 50), others, 0.5, { centerLines: false });
    expect(noCentre).toEqual([]);
  });

  it("rebases guides onto other bounds, keeping the line and the partner", () => {
    const [g] = alignmentGuides(b(100, 0, 50, 50), [b(100, 200, 50, 50)], 0.5);
    const moved = b(100, 40, 50, 50);
    const [r] = rebaseGuides([g!], moved);
    expect(r).toMatchObject({ axis: "x", at: 100, other: b(100, 200, 50, 50), moving: moved });
    expect(r!.from).toBe(40);
  });
});
