import type { ElementId } from "@oh-just-another/types";
import { GIF_AUTOSTOP_MS } from "../constants.js";

/**
 * Transient per-shape playback state for animated images. Not serialised —
 * purely a runtime view, rebuilt on insert / rehydrate.
 */
interface PlaybackEntry {
  playing: boolean;
  /** Wall-clock origin for playback position (now − originMs = frame time). */
  originMs: number;
  /** Wall-clock the current play run began — drives the auto-stop timer
   *  independently of `originMs` so resuming doesn't instantly re-trip it. */
  playStartMs: number;
  /** Playback offset a paused shape is frozen at. */
  frozenMs: number;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== "function") return false;
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Owns per-shape GIF playback state (auto-stop + reduced-motion). Extracted
 * from the Editor god-class: the controller is the state machine, while the
 * Editor keeps the orchestration (scene iteration, animation tick, render
 * scheduling) and delegates every state read/write here.
 */
export class GifPlaybackController {
  private readonly state = new Map<ElementId, PlaybackEntry>();

  /** Element id currently hovered — a hovered heavy GIF keeps playing
   *  (its auto-stop timer is held off). Set by the pointer hover path. */
  private hoveredId: ElementId | null = null;

  /**
   * Seed playback for a freshly-animated shape. Start paused (frozen on
   * frame 0) when the user prefers reduced motion; playing otherwise.
   */
  ensure(id: ElementId): void {
    if (this.state.has(id)) return;
    const now = nowMs();
    this.state.set(id, {
      playing: !prefersReducedMotion(),
      originMs: now,
      playStartMs: now,
      frozenMs: 0,
    });
  }

  /** Playback timestamp fed to the renderer's animation clock for a shape:
   *  wall-clock when unmanaged, play offset when playing, the frozen frame
   *  when paused. */
  clock(id: ElementId): number {
    const st = this.state.get(id);
    const now = nowMs();
    if (!st) return now;
    return st.playing ? now - st.originMs : st.frozenMs;
  }

  /**
   * Toggle GIF playback for a shape — wired to a click on an animated image
   * (resume after auto-stop, play after reduced-motion). Resuming continues
   * from the frozen frame.
   */
  toggle(id: ElementId): void {
    const now = nowMs();
    const st = this.state.get(id);
    if (!st) {
      this.state.set(id, { playing: true, originMs: now, playStartMs: now, frozenMs: 0 });
    } else if (st.playing) {
      st.frozenMs = now - st.originMs;
      st.playing = false;
    } else {
      // Resume from the frozen frame AND restart the auto-stop timer,
      // otherwise a heavy GIF (frozen past GIF_AUTOSTOP_MS) would re-trip
      // auto-stop on the very next tick — playing one frame then freezing
      // again.
      st.originMs = now - st.frozenMs;
      st.playStartMs = now;
      st.playing = true;
    }
  }

  /**
   * Hover entered an animated shape: resume it if paused and hold off its
   * auto-stop timer while the pointer stays over it. Pass `null` when the
   * pointer leaves all shapes. Returns true when a paused shape was resumed,
   * so the caller can re-arm the animation tick and schedule a render.
   */
  hoverEnter(id: ElementId | null): boolean {
    if (this.hoveredId === id) return false;
    this.hoveredId = id;
    if (id === null) return false;
    const st = this.state.get(id);
    if (st && !st.playing) {
      const now = nowMs();
      st.originMs = now - st.frozenMs;
      st.playStartMs = now;
      st.playing = true;
      return true;
    }
    return false;
  }

  /** True when the shape's GIF is paused (drives the overlay badge). */
  isPaused(id: ElementId): boolean {
    return this.state.get(id)?.playing === false;
  }

  /**
   * Freeze heavy GIFs after `GIF_AUTOSTOP_MS` of continuous play. The caller
   * passes the ids of animated image shapes classified as "heavy"; light GIFs
   * loop forever and are never passed in. A hovered heavy GIF keeps playing —
   * its timer is pushed forward so it never auto-stops under the pointer.
   */
  autoStopHeavy(heavyIds: Iterable<ElementId>): void {
    const now = nowMs();
    for (const id of heavyIds) {
      const st = this.state.get(id);
      if (!st?.playing) continue;
      if (id === this.hoveredId) {
        st.playStartMs = now;
        continue;
      }
      if (now - st.playStartMs > GIF_AUTOSTOP_MS) {
        st.frozenMs = now - st.originMs;
        st.playing = false;
      }
    }
  }
}
