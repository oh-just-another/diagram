/**
 * Text-shaping abstraction. Lets a host swap the default
 * `canvas.measureText`-based path for a richer shaping engine when
 * consistent server-side ↔ browser layout matters or when batching
 * many measurements is the hot path.
 *
 * The default path delegates to `ctx.measureText`. Hosts that need
 * deterministic cross-environment layout implement this interface and
 * install it via {@link setActiveTextShaper}.
 */
export interface TextShaper {
  /**
   * Measure a single line in the given font. Returns the advance
   * width in CSS pixels. Hosts may also expose glyph runs for
   * decoration positioning — the kernel only requires width today.
   */
  measure(text: string, font: ShaperFont): { width: number };

  /**
   * Returns the glyph layout for richer renderers that want to draw the
   * actual glyphs themselves. Not invoked by the built-in Canvas2D renderer.
   */
  shape?(text: string, font: ShaperFont): readonly ShapedGlyph[];
}

export interface ShaperFont {
  readonly family: string;
  readonly size: number;
  readonly weight?: "normal" | "bold" | number;
  readonly style?: "normal" | "italic";
}

export interface ShapedGlyph {
  /** Glyph id in the resolved font (renderer-specific). */
  readonly glyphId: number;
  /** Advance width in CSS pixels. */
  readonly advance: number;
  /** X offset from the line origin. */
  readonly x: number;
  /** Y offset from the line baseline. */
  readonly y: number;
}

// Process-global active shaper. The built-in text renderer's signature is
// `(shape, target)` with no extra arg, so rather than thread a shaper
// through every renderer it consults this module-level registry at call
// time.

let activeShaper: TextShaper | null = null;
const shaperListeners = new Set<(shaper: TextShaper | null) => void>();

/**
 * Install a process-global text shaper. Subsequent `getActiveTextShaper()`
 * calls (used by the built-in `drawText` renderer) return it; passing `null`
 * reverts to the Canvas2D `target.measureText` path. Idempotent — last write
 * wins. Registered listeners are notified so backends can react at the
 * moment the shaper arrives (e.g. warm up a glyph atlas) instead of on
 * the next frame that happens to draw text.
 */
export const setActiveTextShaper = (shaper: TextShaper | null): void => {
  activeShaper = shaper;
  for (const listener of shaperListeners) listener(shaper);
};

/**
 * Subscribe to active-shaper changes. Returns an unsubscribe function.
 * The listener is NOT called for the current value — read it via
 * `getActiveTextShaper()` first when needed.
 */
export const onTextShaperChange = (listener: (shaper: TextShaper | null) => void): (() => void) => {
  shaperListeners.add(listener);
  return () => {
    shaperListeners.delete(listener);
  };
};

export const getActiveTextShaper = (): TextShaper | null => activeShaper;
