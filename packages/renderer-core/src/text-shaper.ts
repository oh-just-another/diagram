/**
 * Text-shaping abstraction. Lets a host swap the default
 * `canvas.measureText`-based path for a richer engine (HarfBuzz /
 * ICU4X / harfbuzzjs / canvaskit) when consistent server-side ↔
 * browser layout matters or when batching many measurements is the
 * hot path.
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

/**
 * Install a process-global text shaper. Subsequent `getActiveTextShaper()`
 * calls (used by the built-in `drawText` renderer) return it; passing `null`
 * reverts to the Canvas2D `target.measureText` path. Idempotent — last write
 * wins.
 */
export const setActiveTextShaper = (shaper: TextShaper | null): void => {
  activeShaper = shaper;
};

export const getActiveTextShaper = (): TextShaper | null => activeShaper;
