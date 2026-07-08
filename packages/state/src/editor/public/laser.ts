import type { Vec2 } from "@oh-just-another/types";
import { LASER_TRAIL_TTL_MS } from "../../constants.js";

/** One point of a laser trail — world position plus the time it was laid down. */
export interface LaserPoint {
  readonly x: number;
  readonly y: number;
  /** Birth timestamp (ms, `performance.now()` domain) — drives the fade. */
  readonly t: number;
}

/**
 * A single laser stroke: an ordered list of timestamped world points. Purely
 * ephemeral — never enters the scene or history. The overlay ramps each point's
 * opacity from 1 → 0 over {@link LASER_TRAIL_TTL_MS}; the editor prunes points
 * past that age so the trail vanishes shortly after the pointer stops.
 */
export interface LaserStroke {
  readonly points: LaserPoint[];
}

export const beginLaserStroke = (world: Vec2, now: number): LaserStroke => ({
  points: [{ x: world.x, y: world.y, t: now }],
});

export const extendLaserStroke = (stroke: LaserStroke, world: Vec2, now: number): void => {
  stroke.points.push({ x: world.x, y: world.y, t: now });
};

/**
 * Drop every point older than `ttl` (and any stroke left empty). Returns the
 * surviving strokes plus a `changed` flag; when nothing expired the SAME array
 * reference is returned so the render-overlay memo can skip a rebuild. The
 * returned array is fresh only when a prune actually happened.
 */
export const pruneLaserStrokes = (
  strokes: readonly LaserStroke[],
  now: number,
  ttl: number = LASER_TRAIL_TTL_MS,
): { readonly strokes: LaserStroke[]; readonly changed: boolean } => {
  let changed = false;
  const next: LaserStroke[] = [];
  for (const stroke of strokes) {
    const kept = stroke.points.filter((p) => now - p.t < ttl);
    if (kept.length === stroke.points.length) {
      next.push(stroke);
      continue;
    }
    changed = true;
    if (kept.length > 0) next.push({ points: kept });
  }
  return changed ? { strokes: next, changed } : { strokes: strokes as LaserStroke[], changed };
};
