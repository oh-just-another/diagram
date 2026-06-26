import { AnimationTick } from "../animation-tick.js";
import {
  ANIMATION_MAX_INTERVAL_MS,
  ANIMATION_MIN_INTERVAL_MS,
  ANIMATION_COST_FACTOR,
} from "../constants.js";

/**
 * Editor capabilities the animation tick needs. Keeps the controller off the
 * god-class: scene-coupled work (visibility test, auto-stop, repaint) is
 * delegated back to the Editor through this narrow interface.
 */
export interface AnimationHost {
  /** True while an animated shape is on-screen (drives the tick + culling). */
  hasVisibleAnimatedElement(): boolean;
  /** Freeze heavy GIFs that have played long enough. */
  autoStopHeavyGifs(): void;
  /** Force a full repaint — the adapter advanced the GIF frame. */
  forceAnimationRepaint(): void;
}

/**
 * Owns the GIF/animation tick lifecycle: an adaptive render-cost throttle and
 * visibility-based pause/resume. Runs while any shape carries
 * `metadata.animated` and an animated shape is on-screen; self-terminates
 * otherwise (the underlying `AnimationTick` checks `isAnimated` each frame).
 */
export class AnimationController {
  private readonly tick: AnimationTick;
  /** EMA of animation-tick render cost (ms) — drives the adaptive throttle. */
  private costEma = 0;
  /** Wall-clock of the last animation-tick render — for the interval throttle. */
  private lastTickMs = 0;

  /** Bound `visibilitychange` handler — pause/resume the tick. */
  private readonly onVisibilityChange = (): void => {
    if (typeof document === "undefined") return;
    if (document.hidden) this.tick.stop();
    else this.maybe();
  };

  constructor(private readonly host: AnimationHost) {
    this.tick = new AnimationTick({
      // Keep ticking only while an animated shape is actually on-screen. Frame
      // selection is wall-clock-based, so when the GIF scrolls back into view
      // the tick resumes on the correct frame. Re-armed on viewport changes via
      // `maybe()` in the editor's `notify()`.
      isAnimated: () => this.host.hasVisibleAnimatedElement(),
      onTick: () => {
        this.onTick();
      },
    });
  }

  private onTick(): void {
    // Adaptive throttle — skip this rAF if an animation frame was rendered too
    // recently. The target interval grows with the measured render cost so a
    // heavy scene drops GIF fps instead of blowing the frame budget.
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const target = Math.min(
      ANIMATION_MAX_INTERVAL_MS,
      Math.max(ANIMATION_MIN_INTERVAL_MS, this.costEma * ANIMATION_COST_FACTOR),
    );
    if (now - this.lastTickMs < target) return;
    this.lastTickMs = now;
    // Freeze heavy GIFs that have played long enough.
    this.host.autoStopHeavyGifs();
    // Force a full re-render: the scene reference hasn't changed, but the
    // animation adapter advanced the GIF frame.
    this.host.forceAnimationRepaint();
    const cost = (typeof performance !== "undefined" ? performance.now() : Date.now()) - now;
    // EMA so a single spike doesn't overreact; decays back when load drops.
    this.costEma = this.costEma * 0.8 + cost * 0.2;
  }

  /** Register the document visibility listener (browser host only). */
  attach(): void {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
  }

  /** Stop the tick and unregister the listener. */
  detach(): void {
    this.tick.stop();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }
  }

  /**
   * Re-arm the tick after a change that may have brought an animated shape into
   * (or out of) view — pan / zoom / scene edit. `AnimationTick.start()` no-ops
   * when already running or when not animated, so this is cheap to call from
   * `notify()`.
   */
  maybe(): void {
    if (this.host.hasVisibleAnimatedElement()) this.tick.start();
  }
}
