/**
 * Animated-content adapter scaffold.
 *
 * The kernel doesn't decode GIF / Lottie / video itself. Instead it
 * exposes an `AnimatedSourceAdapter` interface and a process-global
 * registry indexed by `kind` ("gif", "lottie", "video", "<your-format>").
 * Hosts plug their decoder of choice:
 *
 *   registerAnimationAdapter({
 *     kind: "gif",
 *     getFrameAt(data, timestampMs) { ... return ImageBitmap }
 *   });
 *
 * The image renderer in `renderer-core` consults the registry
 * when an `ImageElement` carries `animationKind` + `animationData`
 * fields. Renderers that don't care about animation ignore the
 * registry entirely — the shape's static `src` remains the fallback
 * path.
 *
 * The animation tick (driving requestAnimationFrame for live
 * playback) lives in the state package — the kernel only ships the
 * stateless "what should this frame look like?" question.
 */

export interface AnimatedSourceAdapter<Data = unknown> {
  readonly kind: string;
  /**
   * Return the image source the renderer should draw at
   * `timestampMs` (typically `performance.now()`). The returned
   * value is opaque — it gets passed straight to `target.drawImage
   * (image, ...)`. Backends accept different types: Canvas2D wants
   * a `CanvasImageSource`, headless SVG wants a string URL. The
   * adapter's `kind` is paired with the renderer the host actually
   * uses, so there's no ambiguity in practice.
   *
   * Implementations are stateless w.r.t. the registry; they may
   * cache decoded frames internally (the `data` payload is the
   * natural cache key).
   */
  getFrameAt(data: Data, timestampMs: number): unknown;
  /**
   * Optional — total animation duration in ms. The animation tick
   * uses this to schedule the next frame; an unset value means
   * "keep ticking forever" (endless lottie loops or streamed video).
   */
  totalDurationMs?(data: Data): number;
}

const registry = new Map<string, AnimatedSourceAdapter>();

export const registerAnimationAdapter = <D>(adapter: AnimatedSourceAdapter<D>): void => {
  registry.set(adapter.kind, adapter);
};

export const unregisterAnimationAdapter = (kind: string): void => {
  registry.delete(kind);
};

export const getAnimationAdapter = (kind: string): AnimatedSourceAdapter | undefined =>
  registry.get(kind);

export const listAnimationKinds = (): readonly string[] => [...registry.keys()];

/**
 * Content-ready notification. Adapters decode lazily and often
 * asynchronously (e.g. the GIF adapter's `createImageBitmap`): the
 * first `getFrameAt` returns `null` while the decode is in flight. For
 * a *playing* shape the host's animation tick re-renders on the next
 * rAF and picks up the frames — but a **paused** shape (reduced-motion,
 * auto-stopped, frozen) has no tick, so without a nudge it would stay
 * blank forever once decoded. Adapters call
 * {@link notifyAnimationContentReady} when a decode completes; the host
 * (editor) subscribes via {@link onAnimationContentReady} and schedules
 * one more render so the now-decoded (possibly paused) frame paints.
 */
const contentListeners = new Set<() => void>();

export const onAnimationContentReady = (fn: () => void): (() => void) => {
  contentListeners.add(fn);
  return () => contentListeners.delete(fn);
};

export const notifyAnimationContentReady = (): void => {
  for (const fn of contentListeners) {
    try {
      fn();
    } catch {
      /* a listener throwing must not break sibling listeners / decode */
    }
  }
};

/**
 * Pluggable playback clock. Returns the playback position (ms) the
 * animation adapter should be sampled at for a given shape — letting
 * a host pause / freeze / offset individual animated shapes without
 * the renderer knowing about playback state.
 *
 * Default: wall-clock `performance.now()` for every shape (every GIF
 * plays, in lock-step with real time). A host (the editor) overrides
 * this via {@link setAnimationClock} to consult its per-shape
 * playback map — returning a frozen value for paused shapes, an
 * offset for shapes started later, etc.
 *
 * Module-global by design: the shape-renderer signature is
 * `(shape, target)` with no options channel, so the host sets the
 * clock immediately before each synchronous render pass.
 */
type AnimationClock = (shape: { readonly id?: unknown }) => number;

let animationClock: AnimationClock = () =>
  typeof performance !== "undefined" ? performance.now() : 0;

export const setAnimationClock = (clock: AnimationClock): void => {
  animationClock = clock;
};

/** Restore the default wall-clock playback (used in tests / teardown). */
export const resetAnimationClock = (): void => {
  animationClock = () => (typeof performance !== "undefined" ? performance.now() : 0);
};

/**
 * Resolve an image source for an `ImageElement`. When the shape has
 * an `animationKind` and a matching adapter is registered, the
 * adapter's `getFrameAt(animationData, t)` result is returned, where
 * `t` comes from the pluggable {@link setAnimationClock} (default
 * wall-clock). Otherwise — and as a fallback when the adapter throws —
 * falls back to the static `src`. The renderer hands the result to
 * `target.drawImage` without further interpretation.
 */
export const resolveImageSource = (
  shape: {
    readonly id?: unknown;
    readonly src: string;
    readonly animationKind?: string;
    readonly animationData?: unknown;
  },
  timestampMs: number = animationClock(shape),
): unknown => {
  if (!shape.animationKind) return shape.src;
  const adapter = registry.get(shape.animationKind);
  if (!adapter) return shape.src;
  try {
    return adapter.getFrameAt(shape.animationData, timestampMs);
  } catch {
    return shape.src;
  }
};
