/**
 * Tiny requestAnimationFrame loop manager. Used by the editor for
 * animated content (GIFs) that needs a re-render every frame even when
 * the scene reference hasn't changed.
 *
 * Self-terminating: each tick consults `isAnimated()`; when it
 * returns false the loop stops and `start()` is a no-op until
 * called again. SSR-safe — no-op when `requestAnimationFrame` is
 * not on `globalThis`.
 */
export class AnimationTick {
  private frameId: number | null = null;
  private readonly isAnimated: () => boolean;
  private readonly onTick: () => void;

  constructor(opts: { readonly isAnimated: () => boolean; readonly onTick: () => void }) {
    this.isAnimated = opts.isAnimated;
    this.onTick = opts.onTick;
  }

  /** Begin the rAF loop. No-op when already running or when
   *  `requestAnimationFrame` is unavailable (Node).
   */
  start(): void {
    if (this.frameId !== null) return;
    if (typeof requestAnimationFrame === "undefined") return;
    const loop = (): void => {
      if (!this.isAnimated()) {
        this.frameId = null;
        return;
      }
      this.onTick();
      this.frameId = requestAnimationFrame(loop);
    };
    this.frameId = requestAnimationFrame(loop);
  }

  /** Cancel any pending frame. Safe to call from dispose paths. */
  stop(): void {
    if (this.frameId === null) return;
    if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  /** True while the loop is actively scheduled. */
  get running(): boolean {
    return this.frameId !== null;
  }
}
