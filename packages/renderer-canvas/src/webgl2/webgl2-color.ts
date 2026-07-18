import type { Color } from "@oh-just-another/types";
import { color as colorParser } from "@oh-just-another/math";

/**
 * Parse a CSS color into normalised RGBA `[r, g, b, a]` where every
 * component is in `[0, 1]`. Delegates to `@math/color` so the WebGL2
 * backend understands the same syntaxes as Canvas2D — short hex
 * (`#bbb`), `rgb()`/`rgba()`, named colors (`white`, `transparent`),
 * and `#rrggbbaa` with explicit alpha.
 *
 * Anything unparseable falls back to opaque black plus a dev-time
 * warning.
 */
export const parseWebGL2Color = (color: Color | null): [number, number, number, number] => {
  if (color === null) return [0, 0, 0, 0];
  try {
    const { r, g, b, a } = colorParser.parse(color);
    return [r / 255, g / 255, b / 255, a];
  } catch {
    if (typeof console !== "undefined") {
      console.warn(`[WebGL2Target] cannot parse color '${color}', falling back to black`);
    }
    return [0, 0, 0, 1];
  }
};
