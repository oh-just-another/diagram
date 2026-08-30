import type { Bounds, Vec2 } from "@oh-just-another/types";
import type { HandleId } from "../../interaction/handle.js";

/**
 * Object snapping — pure math shared by the move / resize gestures.
 *
 * While a shape (or group frame) is dragged, its left / centre / right and
 * top / centre / bottom lines are compared with the same lines of every
 * nearby shape ("others"). The closest pair within `threshold` (world
 * units — the caller divides the screen threshold by zoom) wins per axis
 * and the delta is corrected so the lines coincide. Each snap also yields a
 * {@link SnapGuide} for the overlay: the shared line, spanning both shapes.
 *
 * Resizing snaps only the edge(s) the handle drags (like grid snapping) and
 * can additionally "suggest" a size: the dragged edge lands where the
 * shape's width / height equals a nearby shape's, and that shape is
 * reported as `sizeMatch` so the overlay can highlight it.
 */

/** One alignment guide: a vertical (`axis: "x"`) or horizontal line. */
export interface SnapGuide {
  readonly axis: "x" | "y";
  /** World coordinate of the line (x for vertical, y for horizontal). */
  readonly at: number;
  /** Extent along the other axis — covers both snapped shapes. */
  readonly from: number;
  readonly to: number;
  /**
   * `edge` — an edge of the moved shape met an edge / centre of `other`;
   * `center` — the moved shape's centre line snapped. Only edge guides get
   * distance segments (the gap between the two shapes along the guide).
   */
  readonly kind: "edge" | "center";
  /** World AABB of the moved / resized shape where it landed. */
  readonly moving: Bounds;
  /** World AABB of the shape it aligned with. */
  readonly other: Bounds;
}

export interface ObjectSnapResult {
  readonly delta: Vec2;
  readonly guides: readonly SnapGuide[];
}

/** The shape whose size a resize now matches, and on which axis. */
export interface SizeMatch {
  readonly bounds: Bounds;
  readonly axis: "width" | "height" | "both";
}

export interface ResizeSnapResult extends ObjectSnapResult {
  readonly sizeMatch: SizeMatch | null;
}

export interface ResizeSnapOptions {
  /** Snap the dragged edges to other shapes' edges / centres. */
  readonly alignEdges: boolean;
  /** Snap the width / height to other shapes' sizes. */
  readonly matchSizes: boolean;
}

interface AxisSnap {
  readonly correction: number;
  readonly guideAt: number;
  readonly other: Bounds;
  /** The moved shape's centre line (not an edge) was the one that snapped. */
  readonly center: boolean;
}

// Edges first, centre last: on an exact tie the earlier candidate wins, so
// edge-to-edge alignment beats edge-to-centre.
const linesX = (b: Bounds): readonly number[] => [b.x, b.x + b.width, b.x + b.width / 2];
const linesY = (b: Bounds): readonly number[] => [b.y, b.y + b.height, b.y + b.height / 2];

/** Closest (own line, other line) pair within `threshold`, or `null`. */
const bestAxisSnap = (
  own: readonly number[],
  others: readonly Bounds[],
  lines: (b: Bounds) => readonly number[],
  threshold: number,
  sameKindOnly = false,
): AxisSnap | null => {
  let best: AxisSnap | null = null;
  let bestDist = Infinity;
  own.forEach((mine, mineIndex) => {
    for (const other of others) {
      lines(other).forEach((cand, candIndex) => {
        // Move pairing rule (reference): an edge meets an edge, a centre
        // meets a centre — never edge-to-centre.
        if (sameKindOnly && (mineIndex === 2) !== (candIndex === 2)) return;
        const dist = Math.abs(cand - mine);
        if (dist <= threshold && dist < bestDist) {
          bestDist = dist;
          // Index 2 is the centre line on both sides (see `linesX`).
          best = {
            correction: cand - mine,
            guideAt: cand,
            other,
            center: mineIndex === 2 || candIndex === 2,
          };
        }
      });
    }
  });
  return best;
};

const guideFor = (
  axis: "x" | "y",
  snap: AxisSnap,
  moving: Bounds,
  kindOverride?: "edge",
): SnapGuide => {
  const other = snap.other;
  const kind = kindOverride ?? (snap.center ? "center" : "edge");
  return axis === "x"
    ? {
        axis,
        at: snap.guideAt,
        from: Math.min(moving.y, other.y),
        to: Math.max(moving.y + moving.height, other.y + other.height),
        kind,
        moving,
        other,
      }
    : {
        axis,
        at: snap.guideAt,
        from: Math.min(moving.x, other.x),
        to: Math.max(moving.x + moving.width, other.x + other.width),
        kind,
        moving,
        other,
      };
};

const shifted = (b: Bounds, d: Vec2): Bounds => ({ ...b, x: b.x + d.x, y: b.y + d.y });

/**
 * Which axes an object snap actually corrected, read off its guides (a
 * guide is emitted exactly for a corrected axis). Callers compose the
 * uncovered axes with grid snapping — object snapping lands per axis, so
 * a single alignment must not disable the grid on the free one.
 */
export const snappedAxes = (
  guides: readonly SnapGuide[],
): { readonly x: boolean; readonly y: boolean } => ({
  x: guides.some((g) => g.axis === "x"),
  y: guides.some((g) => g.axis === "y"),
});

/** Per-axis pick: `object` where `covered`, `grid` elsewhere. */
export const composeAxisDeltas = (
  object: Vec2,
  covered: { readonly x: boolean; readonly y: boolean },
  grid: Vec2,
): Vec2 => ({ x: covered.x ? object.x : grid.x, y: covered.y ? object.y : grid.y });

export interface MoveSnapOptions {
  /**
   * Offer the moved shape's centre lines (default `true`). A multi-shape
   * selection snaps by its frame edges only, like the reference.
   */
  readonly centerLines?: boolean;
}

/**
 * Correct a move delta so the moved shape's edges / centres coincide with
 * a nearby shape's — edge to edge, centre to centre. `moving` is the
 * press-time world AABB; `others` are the candidate AABBs (not the moving
 * shapes themselves).
 */
export const snapMoveDeltaToObjects = (
  moving: Bounds,
  delta: Vec2,
  others: readonly Bounds[],
  threshold: number,
  opts: MoveSnapOptions = {},
): ObjectSnapResult => {
  if (others.length === 0) return { delta, guides: [] };
  const target = shifted(moving, delta);
  const own = (lines: readonly number[]): readonly number[] =>
    opts.centerLines === false ? lines.slice(0, 2) : lines;
  const sx = bestAxisSnap(own(linesX(target)), others, linesX, threshold, true);
  const sy = bestAxisSnap(own(linesY(target)), others, linesY, threshold, true);
  const out = { x: delta.x + (sx?.correction ?? 0), y: delta.y + (sy?.correction ?? 0) };
  const landed = shifted(moving, out);
  const guides: SnapGuide[] = [];
  if (sx) guides.push(guideFor("x", sx, landed));
  if (sy) guides.push(guideFor("y", sy, landed));
  return { delta: out, guides };
};

const MOVES_WEST: ReadonlySet<HandleId> = new Set(["nw", "w", "sw"]);
const MOVES_EAST: ReadonlySet<HandleId> = new Set(["ne", "e", "se"]);
const MOVES_NORTH: ReadonlySet<HandleId> = new Set(["nw", "n", "ne"]);
const MOVES_SOUTH: ReadonlySet<HandleId> = new Set(["sw", "s", "se"]);

/** Bounds after applying a raw resize delta to the handle's edges (may be inverted). */
const resized = (b: Bounds, handle: HandleId, d: Vec2): Bounds => {
  let x = b.x;
  let w = b.width;
  let y = b.y;
  let h = b.height;
  if (MOVES_WEST.has(handle)) {
    x += d.x;
    w -= d.x;
  } else if (MOVES_EAST.has(handle)) w += d.x;
  if (MOVES_NORTH.has(handle)) {
    y += d.y;
    h -= d.y;
  } else if (MOVES_SOUTH.has(handle)) h += d.y;
  return { x, y, width: w, height: h };
};

/**
 * Correct a resize delta so the dragged edge(s) align with nearby shapes'
 * edges / centres (`alignEdges`) or so the width / height matches a nearby
 * shape's (`matchSizes`). Per axis the smaller correction wins; the
 * stationary edges never move. `original` is the press-time world AABB.
 */
export const snapResizeDeltaToObjects = (
  original: Bounds,
  handle: HandleId,
  delta: Vec2,
  others: readonly Bounds[],
  threshold: number,
  opts: ResizeSnapOptions,
): ResizeSnapResult => {
  if (others.length === 0 || (!opts.alignEdges && !opts.matchSizes)) {
    return { delta, guides: [], sizeMatch: null };
  }
  const raw = resized(original, handle, delta);
  let dx = delta.x;
  let dy = delta.y;
  const guides: SnapGuide[] = [];
  let sizeMatch: SizeMatch | null = null;

  const movesX = MOVES_WEST.has(handle) || MOVES_EAST.has(handle);
  const movesY = MOVES_NORTH.has(handle) || MOVES_SOUTH.has(handle);

  if (movesX) {
    // Edge alignment: only the dragged vertical edge is a candidate line.
    const edge = MOVES_WEST.has(handle) ? raw.x : raw.x + raw.width;
    const align = opts.alignEdges ? bestAxisSnap([edge], others, linesX, threshold) : null;
    // Size match: the dragged edge lands where width == other.width.
    let size: AxisSnap | null = null;
    if (opts.matchSizes) {
      let bestDist = Infinity;
      for (const other of others) {
        const dist = Math.abs(other.width - Math.abs(raw.width));
        if (dist <= threshold && dist < bestDist) {
          bestDist = dist;
          const sign = raw.width < 0 ? -1 : 1;
          const targetEdge = MOVES_WEST.has(handle)
            ? raw.x + raw.width - sign * other.width
            : raw.x + sign * other.width;
          size = { correction: targetEdge - edge, guideAt: targetEdge, other, center: false };
        }
      }
    }
    const pick =
      align && (!size || Math.abs(align.correction) <= Math.abs(size.correction)) ? align : size;
    if (pick) {
      dx += pick.correction;
      if (pick === align)
        guides.push(guideFor("x", pick, resized(original, handle, { x: dx, y: dy }), "edge"));
      else sizeMatch = { bounds: pick.other, axis: "width" };
    }
  }
  if (movesY) {
    const edge = MOVES_NORTH.has(handle) ? raw.y : raw.y + raw.height;
    const align = opts.alignEdges ? bestAxisSnap([edge], others, linesY, threshold) : null;
    let size: AxisSnap | null = null;
    if (opts.matchSizes) {
      let bestDist = Infinity;
      for (const other of others) {
        const dist = Math.abs(other.height - Math.abs(raw.height));
        if (dist <= threshold && dist < bestDist) {
          bestDist = dist;
          const sign = raw.height < 0 ? -1 : 1;
          const targetEdge = MOVES_NORTH.has(handle)
            ? raw.y + raw.height - sign * other.height
            : raw.y + sign * other.height;
          size = { correction: targetEdge - edge, guideAt: targetEdge, other, center: false };
        }
      }
    }
    const pick =
      align && (!size || Math.abs(align.correction) <= Math.abs(size.correction)) ? align : size;
    if (pick) {
      dy += pick.correction;
      if (pick === align)
        guides.push(guideFor("y", pick, resized(original, handle, { x: dx, y: dy }), "edge"));
      else if (sizeMatch?.bounds === pick.other) sizeMatch = { bounds: pick.other, axis: "both" };
      else sizeMatch ??= { bounds: pick.other, axis: "height" };
    }
  }
  return { delta: { x: dx, y: dy }, guides, sizeMatch };
};

/**
 * Gaps between two extents along a guide (reference "distance" intervals):
 * `[a1, a2]` is the aligned-with shape's extent, `[b1, b2]` the moved
 * shape's. Disjoint extents yield the single gap between them; partially
 * overlapping ones yield the two non-shared stretches; identical or nested
 * extents yield nothing.
 */
export const gapIntervals = (
  a1: number,
  a2: number,
  b1: number,
  b2: number,
): readonly { readonly start: number; readonly end: number }[] => {
  if (a2 < b1) return [{ start: a2, end: b1 }];
  if (b2 < a1) return [{ start: b2, end: a1 }];
  if ((a1 <= b1 && a2 >= b2) || (b1 <= a1 && b2 >= a2)) return [];
  return [
    { start: Math.min(a1, b1), end: Math.max(a1, b1) },
    { start: Math.min(a2, b2), end: Math.max(a2, b2) },
  ].filter((g) => g.end > g.start);
};
