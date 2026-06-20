import type { Vec2 } from "@oh-just-another/types";
import { LONG_PRESS_DELAY_MS } from "../constants.js";

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Payload fired to subscribers when the long-press timer wins. */
export interface LongPressFire {
  readonly screenPoint: Vec2;
  readonly worldPoint: Vec2;
}

/**
 * Long-press timer with start / cancel + a single fire callback.
 *
 * Used by the touch / right-click flow — the host arms it on
 * pointerdown and cancels it on the first movement past the
 * slop, on pointerup, or on cancel. If the timer wins, the screen
 * origin is translated to world coords via the supplied
 * `screenToWorld` and forwarded to `onFire`.
 */
export class LongPressController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private origin: Vec2 | null = null;

  constructor(
    private readonly screenToWorld: (p: Vec2) => Vec2,
    private readonly onFire: (payload: LongPressFire) => void,
  ) {}

  /** Arm the long-press timer at `screenPoint`. Resets any prior arm. */
  start(screenPoint: Vec2): void {
    this.cancel();
    this.origin = screenPoint;
    this.timer = setTimeout(() => {
      this.timer = null;
      const origin = this.origin;
      this.origin = null;
      if (!origin) return;
      const worldPoint = this.screenToWorld(origin);
      // Fire AFTER local state is cleared so listeners can call back
      // into the editor (e.g. select shape under press) safely.
      this.onFire({ screenPoint: origin, worldPoint });
    }, LONG_PRESS_DELAY_MS);
  }

  /** Abort any pending fire. Idempotent. */
  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.origin = null;
  }

  /**
   * Cancel the pending fire if the pointer has moved more than
   * `slop` pixels from the press origin. Pointermove handler
   * calls this on every movement to keep the gesture from firing
   * once the user has clearly committed to dragging.
   */
  cancelIfMovedBeyond(point: Vec2, slop: number): void {
    if (!this.origin) return;
    if (distance(this.origin, point) > slop) this.cancel();
  }
}
