import { vec2 } from "@oh-just-another/math";
import { req, type Vec2 } from "@oh-just-another/types";
import type { BrushPoint } from "./shape.js";
import { BRUSH_OUTLINE_ARC_STEP, BRUSH_OUTLINE_MITER_LIMIT } from "./constants.js";

/**
 * The single closed outline polygon of a variable-width brush stroke: the left
 * offset side forward, a round end cap, the right offset side back, a round start
 * cap. Filling this ONE simple polygon (nonzero winding) paints every pixel
 * exactly once — unlike per-segment quads + joint discs, whose overlaps
 * double-blend at `opacity < 1` (dark blotches at the joins).
 *
 * Round joins/caps are approximated by arc points at {@link BRUSH_OUTLINE_ARC_STEP}
 * spacing. Convex corners round outward with an arc; concave corners take the
 * miter (offset-line intersection), clamped to {@link BRUSH_OUTLINE_MITER_LIMIT}
 * half-widths (bevel beyond that) so the polygon stays simple — the WebGL2 earcut
 * fill needs a non-self-intersecting boundary.
 *
 * `points` carry per-vertex half-width. Returns `[]` for `< 2` points (callers
 * draw a single dot as an ellipse). Output is a closed loop in the same local
 * space as `points` (no duplicated closing point; the caller closes the path).
 */
export const brushOutline = (points: readonly BrushPoint[]): Vec2[] => {
  const n = points.length;
  if (n < 2) return [];
  const pos = (i: number): Vec2 => {
    const q = req(points[i]);
    return { x: q.x, y: q.y };
  };
  const halfWidth = (i: number): number => req(points[i]).width;

  // Per-segment unit direction and LEFT normal (perp = (-dy, dx)).
  const dir: Vec2[] = [];
  const nrm: Vec2[] = [];
  for (let i = 0; i < n - 1; i++) {
    const raw = vec2.sub(pos(i + 1), pos(i));
    const d = vec2.lengthSq(raw) > 0 ? vec2.normalize(raw) : { x: 1, y: 0 };
    dir.push(d);
    nrm.push(vec2.perp(d));
  }

  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const w = halfWidth(i);
    const c = pos(i);
    if (i === 0) {
      const nn = req(nrm[0]);
      left.push(vec2.add(c, vec2.mul(nn, w)));
      right.push(vec2.sub(c, vec2.mul(nn, w)));
      continue;
    }
    if (i === n - 1) {
      const nn = req(nrm[n - 2]);
      left.push(vec2.add(c, vec2.mul(nn, w)));
      right.push(vec2.sub(c, vec2.mul(nn, w)));
      continue;
    }
    const nPrev = req(nrm[i - 1]);
    const nNext = req(nrm[i]);
    const turn = vec2.cross(req(dir[i - 1]), req(dir[i]));
    if (Math.abs(turn) < 1e-9) {
      // Collinear — one offset point per side is enough.
      left.push(vec2.add(c, vec2.mul(nPrev, w)));
      right.push(vec2.sub(c, vec2.mul(nPrev, w)));
      continue;
    }
    // turn > 0: left turn → left side concave (miter), right side convex (arc).
    // turn < 0: right turn → left side convex (arc), right side concave (miter).
    if (turn > 0) {
      left.push(...miterSide(c, nPrev, nNext, w, 1));
      right.push(...arcSide(c, nPrev, nNext, w, -1));
    } else {
      left.push(...arcSide(c, nPrev, nNext, w, 1));
      right.push(...miterSide(c, nPrev, nNext, w, -1));
    }
  }

  // Round caps: half-turn arcs from the +normal offset to the -normal offset,
  // bulging past the endpoint along the stroke direction (+dir at the end,
  // -dir at the start). The −π sweep passes through that direction.
  const endCap = capArc(pos(n - 1), req(nrm[n - 2]), halfWidth(n - 1), false);
  const startCap = capArc(pos(0), req(nrm[0]), halfWidth(0), true);

  const outline: Vec2[] = [];
  for (const p of left) outline.push(p);
  for (const p of endCap) outline.push(p);
  for (let i = right.length - 1; i >= 0; i--) outline.push(req(right[i]));
  for (const p of startCap) outline.push(p);
  return outline;
};

/**
 * Concave corner: the miter point where the two offset lines meet, on the
 * `sign` side (+1 = left/+normal, -1 = right/-normal). Beyond the miter limit
 * (a very sharp turn) fall back to a bevel (the two segment-offset points) so the
 * outline can't grow a long spike.
 */
const miterSide = (c: Vec2, nPrev: Vec2, nNext: Vec2, w: number, sign: number): Vec2[] => {
  const m = vec2.normalize(vec2.add(nPrev, nNext));
  const cos = vec2.dot(m, nPrev); // cos of half the turn angle
  if (cos > 1e-3 && 1 / cos <= BRUSH_OUTLINE_MITER_LIMIT) {
    return [vec2.add(c, vec2.mul(m, sign * (w / cos)))];
  }
  return [vec2.add(c, vec2.mul(nPrev, sign * w)), vec2.add(c, vec2.mul(nNext, sign * w))];
};

/**
 * Convex corner: an arc of radius `w` around `c` from the previous offset
 * direction to the next, sampled the short way. `sign` picks the side (+1 =
 * +normal, -1 = -normal).
 */
const arcSide = (c: Vec2, nPrev: Vec2, nNext: Vec2, w: number, sign: number): Vec2[] =>
  arc(c, w, vec2.angle(vec2.mul(nPrev, sign)), vec2.angle(vec2.mul(nNext, sign)));

/**
 * A round cap: the half-turn arc of radius `w` from the +normal offset to the
 * -normal offset. `fromOpposite` starts at the -normal side (for the START cap,
 * which the outline reaches from the reversed right side); the −π sweep makes it
 * bulge along the stroke direction rather than back across the body.
 */
const capArc = (c: Vec2, nrm: Vec2, w: number, fromOpposite: boolean): Vec2[] => {
  const a0 = vec2.angle(nrm) + (fromOpposite ? Math.PI : 0);
  return arc(c, w, a0, a0 - Math.PI);
};

/**
 * Sample a circular arc of `radius` around `c` from angle `a0` to `a1` inclusive,
 * taking the shorter signed sweep, at {@link BRUSH_OUTLINE_ARC_STEP} spacing.
 * A `±π` sweep (a cap) keeps its given sign so the half-circle bulges the right
 * way.
 */
const arc = (c: Vec2, radius: number, a0: number, a1: number): Vec2[] => {
  let delta = a1 - a0;
  while (delta > Math.PI + 1e-9) delta -= 2 * Math.PI;
  while (delta < -Math.PI - 1e-9) delta += 2 * Math.PI;
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / BRUSH_OUTLINE_ARC_STEP));
  const out: Vec2[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = a0 + (delta * k) / steps;
    out.push({ x: c.x + radius * Math.cos(a), y: c.y + radius * Math.sin(a) });
  }
  return out;
};
