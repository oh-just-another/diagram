import {
  getAnchorWorld,
  geometryDefaultAnchorsLocal,
  getAnchorOutwardNormal,
  snapExcludedAnchors,
} from "@oh-just-another/scene";
import type { Vec2 } from "@oh-just-another/types";

export interface AnchorOverlayPoints {
  /** Anchor names, in the same order as `worldPoints`. */
  readonly names: readonly string[];
  /** World-space dot positions, each offset outward by `outsetWorld`. */
  readonly worldPoints: readonly Vec2[];
}

/**
 * World-space positions of an element's default connection-anchor dots,
 * each pushed `outsetWorld` units out along its outward normal (floating
 * ports). Excluded anchors (per `snapExcludedAnchors`) are dropped.
 *
 * Shared by the render overlay (which draws the dots) and the pointer
 * hit-test (which detects a press on a link-start dot to begin a link
 * drag) so the two stay 1:1 — a drawn dot is always grabbable at exactly
 * the pixel it appears. The free outline-attach point is NOT produced
 * here; callers append it separately because it is the real landing
 * point and is never offset.
 */
export const anchorOverlayPoints = (
  shape: Parameters<typeof geometryDefaultAnchorsLocal>[0],
  outsetWorld: number,
): AnchorOverlayPoints => {
  const excluded = snapExcludedAnchors(shape);
  const allLocal = geometryDefaultAnchorsLocal(shape);
  const names = [...allLocal.keys()].filter((n) => !excluded.has(n));
  const worldPoints = names.map((name) => {
    const ref = { kind: "named", name } as const;
    const p = getAnchorWorld(shape, ref);
    if (outsetWorld === 0) return p;
    const n = getAnchorOutwardNormal(shape, ref);
    return { x: p.x + n.x * outsetWorld, y: p.y + n.y * outsetWorld };
  });
  return { names, worldPoints };
};
