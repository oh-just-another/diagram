import type { Vec2 } from "@oh-just-another/types";
import { getShapeLocalBounds, type ShapeBase, type PolygonShape } from "./shape.js";

/**
 * Built-in outline samplers — one per shape `type` that the kernel ships.
 * Plugins can register their own via `registerOutlineSampler` so custom
 * shapes can participate in outline snap + outline-bound edge endpoints.
 *
 * The samplers return points in *local* coordinates; world transform is
 * applied by `getOutlinePoint` / `findNearestOutlinePoint` below.
 */
export type OutlineSampler<S extends ShapeBase = ShapeBase> = (shape: S, ratio: number) => Vec2;

const outlineSamplers = new Map<string, OutlineSampler>();

export const registerOutlineSampler = <S extends ShapeBase>(
  type: S["type"],
  sampler: OutlineSampler<S>,
): void => {
  outlineSamplers.set(type, sampler as OutlineSampler);
};

export const getOutlineSampler = (type: string): OutlineSampler | undefined =>
  outlineSamplers.get(type);

/**
 * Resolve an outline ratio (0..1, clockwise from top-left) to a *world*
 * point on `shape`. Applies the shape's translation / rotation / scale.
 *
 * Throws when the shape's type has no registered outline sampler.
 */
export const getOutlinePoint = (shape: ShapeBase, ratio: number): Vec2 => {
  const sampler = outlineSamplers.get(shape.type);
  if (!sampler) {
    throw new Error(`No outline sampler registered for shape type: ${shape.type}`);
  }
  const local = sampler(shape, clamp01(ratio));
  return localToWorld(shape, local);
};

/**
 * Find the point on the shape's outline closest to `worldPoint`. Returns
 * the ratio (for persistence as an `EdgeEndpoint.outline`), the resolved
 * world position, and the distance — so callers can decide whether to use
 * the snap (e.g. only if it's within their threshold).
 *
 * Samples the outline at a fixed density (`samples`, default 64). The
 * default density is good enough for visual snap; bump it if you need
 * sub-pixel accuracy at high zoom.
 */
export const findNearestOutlinePoint = (
  shape: ShapeBase,
  worldPoint: Vec2,
  samples = 64,
): { ratio: number; world: Vec2; distance: number } | null => {
  const sampler = outlineSamplers.get(shape.type);
  if (!sampler) return null;
  let bestRatio = 0;
  let bestPoint: Vec2 = localToWorld(shape, sampler(shape, 0));
  let bestDistance = distance(worldPoint, bestPoint);
  for (let i = 1; i < samples; i++) {
    const ratio = i / samples;
    const world = localToWorld(shape, sampler(shape, ratio));
    const d = distance(worldPoint, world);
    if (d < bestDistance) {
      bestDistance = d;
      bestRatio = ratio;
      bestPoint = world;
    }
  }
  return { ratio: bestRatio, world: bestPoint, distance: bestDistance };
};

// --- helpers ---

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

const localToWorld = (shape: ShapeBase, local: Vec2): Vec2 => {
  const sx = local.x * shape.scale.x;
  const sy = local.y * shape.scale.y;
  const cos = Math.cos(shape.rotation);
  const sin = Math.sin(shape.rotation);
  return {
    x: shape.position.x + (sx * cos - sy * sin),
    y: shape.position.y + (sx * sin + sy * cos),
  };
};

/**
 * Sample a closed polyline (sequence of points, implicit wrap-around) at
 * `ratio` along its total perimeter. Used by rectangle / polygon
 * samplers — both reduce to "trace these edges in order".
 */
const samplePolyline = (points: readonly Vec2[], ratio: number): Vec2 => {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  // Walk segments by cumulative length until we land on `ratio * total`.
  let total = 0;
  const lengths: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const len = distance(a, b);
    lengths.push(len);
    total += len;
  }
  if (total === 0) return points[0]!;
  let target = total * ratio;
  for (let i = 0; i < points.length; i++) {
    const len = lengths[i]!;
    if (target <= len) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      const t = len === 0 ? 0 : target / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    target -= len;
  }
  return points[0]!;
};

// --- built-in samplers ---

registerOutlineSampler("rectangle", (shape, ratio) => {
  const b = getShapeLocalBounds(shape);
  const corners: readonly Vec2[] = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ];
  return samplePolyline(corners, ratio);
});

registerOutlineSampler("ellipse", (shape, ratio) => {
  // Parameterised by angle from positive-x (3 o'clock), but visually the
  // user expects ratio 0 at the top-left "corner" of the bounding box —
  // i.e. ratio 0 == top of the ellipse (12 o'clock). Offset accordingly.
  const b = getShapeLocalBounds(shape);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const rx = b.width / 2;
  const ry = b.height / 2;
  const angle = ratio * Math.PI * 2 - Math.PI / 2; // start at the top
  return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
});

registerOutlineSampler<PolygonShape>("polygon", (shape, ratio) => {
  return samplePolyline(shape.points, ratio);
});
