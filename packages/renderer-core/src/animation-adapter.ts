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
 * when an `ImageShape` carries `animationKind` + `animationData`
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

const registry = new Map<string, AnimatedSourceAdapter<unknown>>();

export const registerAnimationAdapter = <D>(adapter: AnimatedSourceAdapter<D>): void => {
  registry.set(adapter.kind, adapter as AnimatedSourceAdapter<unknown>);
};

export const unregisterAnimationAdapter = (kind: string): void => {
  registry.delete(kind);
};

export const getAnimationAdapter = (kind: string): AnimatedSourceAdapter<unknown> | undefined =>
  registry.get(kind);

export const listAnimationKinds = (): readonly string[] => [...registry.keys()];

/**
 * Resolve an image source for an `ImageShape`. When the shape has
 * an `animationKind` and a matching adapter is registered, the
 * adapter's `getFrameAt(animationData, now)` result is returned.
 * Otherwise — and as a fallback when the adapter throws — falls
 * back to the static `src`. The renderer hands the result to
 * `target.drawImage` without further interpretation.
 */
export const resolveImageSource = (
  shape: { readonly src: string; readonly animationKind?: string; readonly animationData?: unknown },
  timestampMs: number = typeof performance !== "undefined" ? performance.now() : 0,
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
