/**
 * Backend-agnostic text measurer for environments without a real text engine
 * (Node.js, headless rendering). Approximates glyph widths from a small
 * char-width table; precision is "good enough" for layout — not for exact
 * baseline metrics.
 *
 * For pixel-perfect text the caller can supply a custom `measureText` to
 * `SvgTarget`. The default behaves like Canvas2D's `measureText` would for
 * a system-ui font at the given size.
 */

import { DEFAULT_CHAR_WIDTH_RATIO } from "./constants.js";

// Per-glyph width ratios as a fraction of font-size. Calibrated against a
// system-ui sans-serif at 16px; broadly accurate for ASCII.
const CHAR_RATIOS: Record<string, number> = {
  // Narrow
  i: 0.28,
  l: 0.28,
  I: 0.34,
  t: 0.34,
  f: 0.36,
  j: 0.3,
  r: 0.4,
  " ": 0.3,
  // Wide
  m: 0.86,
  w: 0.82,
  M: 0.86,
  W: 0.92,
  // Default ~0.55 (handled below)
};

export const approxTextWidth = (text: string, _fontFamily: string, fontSize: number): number => {
  let total = 0;
  for (const ch of text) {
    total += (CHAR_RATIOS[ch] ?? DEFAULT_CHAR_WIDTH_RATIO) * fontSize;
  }
  return total;
};
