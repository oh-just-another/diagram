import { describe, expect, it } from "vitest";
import { elementId, type ElementId, type Vec2 } from "@oh-just-another/types";
import {
  DEFAULT_LAYER_ID,
  addElement,
  emptyScene,
  isBrush,
  orderBetween,
  type BrushElement,
  type Scene,
} from "@oh-just-another/scene";
import {
  computeEraseBrushStroke,
  computeEraseFromMasks,
  computeStrokeErasePreviewFromMasks,
  markErasedIntervals,
} from "../src/editor/public/stroke-eraser.js";
import { coveredLength, type Interval } from "../src/editor/public/stroke-eraser-coverage.js";

let idCounter = 0;
const makeId = () => elementId(`frag-${++idCounter}`);

/**
 * Build the accumulated covered-span map the editor grows during a gesture, by
 * running the INCREMENTAL {@link markErasedIntervals} over each segment of a path
 * — mirroring how the live gesture accumulates it, not a whole-path scan.
 */
const erasedFromPath = (
  scene: Scene,
  path: readonly Vec2[],
  radius: number,
): Map<ElementId, Interval[]> => {
  const erased = new Map<ElementId, Interval[]>();
  for (const el of scene.elements.values()) {
    if (!isBrush(el)) continue;
    let cov: Interval[] = [];
    for (let i = 0; i < Math.max(1, path.length - 1); i++) {
      const a = path[i]!;
      const b = path[Math.min(i + 1, path.length - 1)]!;
      cov = markErasedIntervals(el, cov, a, b, radius);
    }
    if (cov.length > 0) erased.set(el.id, cov);
  }
  return erased;
};

/** A horizontal brush at y=0 with points every 10px in x, all half-width 1. */
const horizontalBrush = (xs: number[], width = 1): BrushElement => ({
  id: elementId("brush-1"),
  layerId: DEFAULT_LAYER_ID,
  type: "brush",
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  order: orderBetween(null, null),
  style: { stroke: "#000" },
  points: xs.map((x) => ({ x, y: 0, width })),
});

/** Round a covered-span list so bisection sub-pixel noise doesn't fail equality. */
const round = (cov: readonly Interval[]): [number, number][] =>
  cov.map(([s, e]) => [Math.round(s), Math.round(e)]);

describe("computeEraseBrushStroke (pure)", () => {
  it("cuts the middle → two fragments with edges on the eraser ring", () => {
    const brush = horizontalBrush([0, 10, 20, 30, 40]);
    // Vertical eraser path crossing x=20, radius 2 → removes the arc span x=18..22
    // (the disc's footprint), not just the vertex at x=20. Each survivor ends on
    // the ring: [0,10]→18 and 22→[30,40], so the gap is the eraser diameter.
    const path = [
      { x: 20, y: -50 },
      { x: 20, y: 50 },
    ];
    const { fragments, erasedAny } = computeEraseBrushStroke(brush, path, 2, makeId);
    expect(erasedAny).toBe(true);
    expect(fragments).toHaveLength(2);
    expect(fragments[0]!.points.map((p) => Math.round(p.x))).toEqual([0, 10, 18]);
    expect(round([[fragments[1]!.position.x, fragments[1]!.position.y]])).toEqual([[22, 0]]);
    expect(fragments[1]!.points.map((p) => Math.round(p.x))).toEqual([0, 8, 18]); // re-localised
    expect(fragments.every((f) => f.closed === undefined)).toBe(true);
  });

  it("trims one end → a single shorter fragment ending on the ring", () => {
    const brush = horizontalBrush([0, 10, 20, 30, 40]);
    // Eraser sitting over the last point x=40, radius 2 → removes x=38..40.
    const path = [
      { x: 40, y: -50 },
      { x: 40, y: 50 },
    ];
    const { fragments, erasedAny } = computeEraseBrushStroke(brush, path, 2, makeId);
    expect(erasedAny).toBe(true);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]!.points.map((p) => Math.round(p.x))).toEqual([0, 10, 20, 30, 38]);
  });

  it("a disc grazing BETWEEN two far-apart vertices still cuts (sparse line)", () => {
    // The reported bug: vertex-based erasing missed the line when the disc sat
    // between two vertices (a fast / short stroke has few, far-apart points). The
    // SEGMENT model removes the geometry the disc covers regardless of spacing.
    const brush = horizontalBrush([0, 100]); // one long segment, no interior vertices
    const path = [
      { x: 50, y: -20 },
      { x: 50, y: 20 },
    ]; // disc at the segment's midpoint, nowhere near either vertex
    const { fragments, erasedAny } = computeEraseBrushStroke(brush, path, 10, makeId);
    expect(erasedAny).toBe(true);
    expect(fragments).toHaveLength(2); // the long segment is split in two
    const leftMax = Math.max(...fragments[0]!.points.map((p) => p.x + fragments[0]!.position.x));
    const rightMin = Math.min(...fragments[1]!.points.map((p) => p.x + fragments[1]!.position.x));
    // Cut edges land ~radius from x=50 (on the ring), not at the far vertices.
    expect(leftMax).toBeLessThan(45);
    expect(rightMin).toBeGreaterThan(55);
  });

  it("full erase (whole stroke under the disc) → zero fragments", () => {
    const brush = horizontalBrush([0, 10, 20]);
    // Horizontal path along y=0 covering the whole stroke, radius 100.
    const path = [
      { x: -50, y: 0 },
      { x: 50, y: 0 },
    ];
    const { fragments, erasedAny } = computeEraseBrushStroke(brush, path, 100, makeId);
    expect(erasedAny).toBe(true);
    expect(fragments).toHaveLength(0);
  });

  it("erasing both ends but not the middle keeps the middle as ONE fragment", () => {
    const brush = horizontalBrush([0, 10, 20, 30, 40]);
    // A detouring path that covers the ends (x≈0..10 and x≈30..40) but swings away
    // from the centre — the SEGMENT model keeps the uncovered middle as a real
    // piece (the old vertex model dropped the lone survivor as litter).
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 100 }, // detour away so x=20 stays uncovered
      { x: 30, y: 100 },
      { x: 30, y: 0 },
      { x: 40, y: 0 },
    ];
    const { fragments, erasedAny } = computeEraseBrushStroke(brush, path, 2, makeId);
    expect(erasedAny).toBe(true);
    expect(fragments).toHaveLength(1);
    // The survivor spans the middle and contains the x=20 vertex.
    const xs = fragments[0]!.points.map((p) => p.x + fragments[0]!.position.x);
    expect(Math.min(...xs)).toBeGreaterThan(10);
    expect(Math.max(...xs)).toBeLessThan(30);
    expect(xs.some((x) => Math.abs(x - 20) < 1)).toBe(true);
  });

  it("a truly tiny survivor (< min arc) is dropped as litter", () => {
    // Two near-touching erase passes leaving a sub-pixel nub between them: nothing
    // drawable survives. A 3-point brush with the outer thirds erased and only a
    // hair of centre left → dropped.
    const brush = horizontalBrush([0, 1, 2]);
    const path = [
      { x: -10, y: 0 },
      { x: 10, y: 0 },
    ];
    const { fragments } = computeEraseBrushStroke(brush, path, 5, makeId);
    expect(fragments).toHaveLength(0);
  });

  it("preserves per-point widths in the surviving fragments", () => {
    const brush: BrushElement = {
      ...horizontalBrush([0, 10, 20, 30, 40, 50]),
      points: [
        { x: 0, y: 0, width: 1 },
        { x: 10, y: 0, width: 3 },
        { x: 20, y: 0, width: 5 },
        { x: 30, y: 0, width: 7 },
        { x: 40, y: 0, width: 9 },
        { x: 50, y: 0, width: 11 },
      ],
    };
    // A horizontal eraser path along the stroke from x=15 to x=35 (radius 2) removes
    // x≈13..37; survivors [0..13] and [37..50] keep the original vertices' widths.
    const path = [
      { x: 15, y: 0 },
      { x: 35, y: 0 },
    ];
    const { fragments } = computeEraseBrushStroke(brush, path, 2, makeId);
    expect(fragments).toHaveLength(2);
    const widths = fragments.flatMap((f) => f.points.map((p) => p.width));
    // The kept originals keep their widths: [1,3] and [9,11] all survive. (The
    // boundary points add interpolated widths in between, so assert containment.)
    for (const w of [1, 3, 9, 11]) expect(widths).toContain(w);
  });

  it("nothing near the path → erasedAny false, unchanged brush returned", () => {
    const brush = horizontalBrush([0, 10, 20]);
    const path = [
      { x: 500, y: 500 },
      { x: 600, y: 600 },
    ];
    const { fragments, erasedAny } = computeEraseBrushStroke(brush, path, 2, makeId);
    expect(erasedAny).toBe(false);
    expect(fragments).toEqual([brush]);
  });

  it("erases a point by its CENTRE, not its stroke width (matches the ring)", () => {
    const brush = horizontalBrush([0], 10); // single fat point, half-width 10
    // Ring radius 2 grazing near the point but NOT over its centre (3 away in x)
    // leaves it — a fat stroke is not eaten just because the ring touches its edge.
    const near = computeEraseBrushStroke(
      brush,
      [
        { x: 3, y: -5 },
        { x: 3, y: 5 },
      ],
      2,
      makeId,
    );
    expect(near.erasedAny).toBe(false);
    // Passing the ring over the centre (1 away ≤ radius 2) erases it.
    const over = computeEraseBrushStroke(
      brush,
      [
        { x: 1, y: -5 },
        { x: 1, y: 5 },
      ],
      2,
      makeId,
    );
    expect(over.erasedAny).toBe(true);
  });
});

describe("markErasedIntervals (incremental)", () => {
  it("accumulates covered arc spans across segments, ignoring repeats", () => {
    const brush = horizontalBrush([0, 10, 20, 30, 40]);
    // A vertical segment at x=20 covers the arc span x≈18..22.
    let cov = markErasedIntervals(brush, [], { x: 20, y: -5 }, { x: 20, y: 5 }, 2);
    expect(round(cov)).toEqual([[18, 22]]);
    // A second segment at x=0 adds the span x≈0..2; the accumulated set keeps both.
    cov = markErasedIntervals(brush, cov, { x: 0, y: -5 }, { x: 0, y: 5 }, 2);
    expect(round(cov)).toEqual([
      [0, 2],
      [18, 22],
    ]);
    // Re-running the same segment adds nothing new (covered length unchanged).
    const before = coveredLength(cov);
    const again = markErasedIntervals(brush, cov, { x: 0, y: -5 }, { x: 0, y: 5 }, 2);
    expect(coveredLength(again)).toBeCloseTo(before, 5);
  });
});

describe("computeEraseFromMasks", () => {
  it("cuts a scene brush into fragments and returns patches", () => {
    const scene = addElement(emptyScene(), horizontalBrush([0, 10, 20, 30, 40])).scene;
    const erased = erasedFromPath(
      scene,
      [
        { x: 20, y: -50 },
        { x: 20, y: 50 },
      ],
      2,
    );
    const result = computeEraseFromMasks(scene, erased, makeId);
    expect(result).not.toBeNull();
    expect(result!.removedIds).toEqual([elementId("brush-1")]);
    // Two fragments added; the original is gone from the next scene.
    expect(result!.addedIds).toHaveLength(2);
    expect(result!.scene.elements.has(elementId("brush-1"))).toBe(false);
  });

  it("returns null when no brush has covered spans", () => {
    const scene = addElement(emptyScene(), horizontalBrush([0, 10, 20])).scene;
    expect(computeEraseFromMasks(scene, new Map(), makeId)).toBeNull();
  });
});

describe("computeStrokeErasePreviewFromMasks (pure)", () => {
  it("returns fragments + the touched original for a brush the masks cut", () => {
    const scene = addElement(emptyScene(), horizontalBrush([0, 10, 20, 30, 40])).scene;
    const erased = erasedFromPath(
      scene,
      [
        { x: 20, y: -50 },
        { x: 20, y: 50 },
      ],
      2,
    );
    const preview = computeStrokeErasePreviewFromMasks(scene, erased);
    expect(preview).not.toBeNull();
    expect(preview!.fragments).toHaveLength(2);
    expect(preview!.hidden.has(elementId("brush-1"))).toBe(true);
  });

  it("returns null when the masks are empty", () => {
    const scene = addElement(emptyScene(), horizontalBrush([0, 10, 20])).scene;
    expect(computeStrokeErasePreviewFromMasks(scene, new Map())).toBeNull();
  });
});
