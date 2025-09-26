import type { TextAlign, TextBaseline } from "./render-target.js";

/**
 * Text-shaping abstraction. Lets a host swap the default
 * `canvas.measureText`-based path for a richer engine (HarfBuzz /
 * ICU4X / harfbuzzjs / canvaskit) when consistent server-side ↔
 * browser layout matters or when batching many measurements is the
 * hot path.
 *
 * The kernel ships a `Canvas2DTextShaper` implementation that delegates to
 * `ctx.measureText`. Hosts that need deterministic cross-environment layout
 * can implement this interface and pass it via `EditorOptions.textShaper`.
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

// Re-export the RenderTarget alignment types under the shaper namespace.
export type { TextAlign, TextBaseline };

// --- Process-global active shaper ---
//
// `wrapText` accepts an optional `shaper` parameter — but the
// built-in `drawText` renderer in `built-in-renderers.ts` is a
// `ShapeRenderer<TextElement>` whose signature is `(shape, target)`,
// no extra arg. Threading a shaper through every ShapeRenderer is
// invasive; instead we expose a module-level registry that
// `drawText` consults at call time. Editor sets it via
// `setActiveTextShaper(options.textShaper)` on construction.

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
