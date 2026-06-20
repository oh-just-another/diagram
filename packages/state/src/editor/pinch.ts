import type { Vec2 } from "@oh-just-another/types";
import { PINCH_MIN_MOVEMENT_PX } from "../constants.js";

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Two-finger pinch / pan gesture controller.
 *
 * `begin(points)` snapshots the initial midpoint + finger distance.
 * `apply(points)` translates frame-to-frame deltas into a `zoomAt`
 * + `panBy` pair through the host callbacks, then re-baselines so
 * the next frame is incremental. `end()` releases the gesture.
 *
 * Jitter < `PINCH_MIN_MOVEMENT_PX` is skipped — keeps resting
 * fingers from slowly drifting the camera.
 *
 * Editor uses one controller; the public state surface
 * (`isActive`) lets the pointer binding short-circuit move /
 * up / cancel handlers while the pinch owns the gesture.
 */
export class PinchController {
  private origin: {
    midpointScreen: Vec2;
    midpointWorld: Vec2;
    distance: number;
  } | null = null;

  constructor(
    private readonly screenToWorld: (p: Vec2) => Vec2,
    private readonly zoomAt: (factor: number, anchorWorld: Vec2) => void,
    private readonly panBy: (deltaScreen: Vec2) => void,
  ) {}

  isActive(): boolean {
    return this.origin !== null;
  }

  /** Snapshot the initial midpoint + finger distance. No-op with < 2 fingers. */
  begin(points: readonly Vec2[]): void {
    if (points.length < 2) return;
    const [p1, p2] = points as [Vec2, Vec2];
    const midpointScreen = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    this.origin = {
      midpointScreen,
      midpointWorld: this.screenToWorld(midpointScreen),
      distance: distance(p1, p2),
    };
  }

  /**
   * Translate the latest finger positions into a zoom + pan call
   * pair. Jitter frames (below `PINCH_MIN_MOVEMENT_PX` combined
   * change) are dropped so the camera doesn't creep under resting
   * fingers. After applying, re-baselines so the next frame is
   * incremental.
   */
  apply(points: readonly Vec2[]): void {
    if (!this.origin) return;
    if (points.length < 2) return;
    const [p1, p2] = points as [Vec2, Vec2];

    const dist = distance(p1, p2);
    const midScreen = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const moved =
      distance(midScreen, this.origin.midpointScreen) + Math.abs(dist - this.origin.distance);
    if (moved < PINCH_MIN_MOVEMENT_PX) return;

    // Zoom: ratio of current finger distance over the start distance,
    // centered on the *current* midpoint (so the gesture feels
    // grounded even as the user's fingers rotate / drift).
    const factor = dist / this.origin.distance;
    if (factor !== 1) {
      const anchorWorld = this.screenToWorld(midScreen);
      this.zoomAt(factor, anchorWorld);
    }
    // Pan: screen delta between the original and current midpoint.
    // After the zoom-around-current-midpoint above this delta
    // translates to pure translation in world space.
    const dx = midScreen.x - this.origin.midpointScreen.x;
    const dy = midScreen.y - this.origin.midpointScreen.y;
    if (dx !== 0 || dy !== 0) {
      this.panBy({ x: dx, y: dy });
    }

    // Re-baseline so the next frame is incremental, not cumulative.
    this.origin = {
      midpointWorld: this.screenToWorld(midScreen),
      distance: dist,
      midpointScreen: midScreen,
    };
  }

  /** Drop the gesture state. Idempotent. */
  end(): void {
    this.origin = null;
  }
}
