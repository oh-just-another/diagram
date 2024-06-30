import type { Color } from "@oh-just-another/types";

/**
 * RGBA color in 0–255 (r, g, b) and 0–1 (a). All channels are linear in the
 * byte sense — no gamma correction is applied.
 */
export interface RGBA {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const NAMED: Readonly<Record<string, RGBA>> = Object.freeze({
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  yellow: { r: 255, g: 255, b: 0, a: 1 },
  cyan: { r: 0, g: 255, b: 255, a: 1 },
  magenta: { r: 255, g: 0, b: 255, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
});

/**
 * Parse a CSS color string into RGBA. Supported syntaxes:
 *   - hex: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`
 *   - functional: `rgb(r, g, b)`, `rgba(r, g, b, a)` (commas, integers, alpha 0..1)
 *   - named: see NAMED (subset of CSS named colors)
 *
 * Throws on input that cannot be parsed. Whitespace and case are normalized.
 */
export const parse = (input: string): RGBA => {
  const s = input.trim().toLowerCase();

  if (s in NAMED) return NAMED[s]!;

  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseHexByte(hex[0]! + hex[0]!);
      const g = parseHexByte(hex[1]! + hex[1]!);
      const b = parseHexByte(hex[2]! + hex[2]!);
      const a = hex.length === 4 ? parseHexByte(hex[3]! + hex[3]!) / 255 : 1;
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) {
        throw new Error(`Invalid hex color: ${input}`);
      }
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseHexByte(hex.slice(0, 2));
      const g = parseHexByte(hex.slice(2, 4));
      const b = parseHexByte(hex.slice(4, 6));
      const a = hex.length === 8 ? parseHexByte(hex.slice(6, 8)) / 255 : 1;
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) {
        throw new Error(`Invalid hex color: ${input}`);
      }
      return { r, g, b, a };
    }
    throw new Error(`Invalid hex color length: ${input}`);
  }

  const rgbMatch = /^rgba?\(([^)]+)\)$/.exec(s);
  if (rgbMatch) {
    const parts = rgbMatch[1]!.split(",").map((p) => p.trim());
    if (parts.length !== 3 && parts.length !== 4) {
      throw new Error(`Expected 3 or 4 components: ${input}`);
    }
    const r = Math.round(Number(parts[0]));
    const g = Math.round(Number(parts[1]));
    const b = Math.round(Number(parts[2]));
    const a = parts.length === 4 ? Number(parts[3]) : 1;
    if ([r, g, b, a].some(Number.isNaN)) throw new Error(`Invalid component: ${input}`);
    return { r, g, b, a };
  }

  throw new Error(`Cannot parse color: ${input}`);
};

/**
 * Format an RGBA value as a CSS color. Uses `#rrggbb` when alpha is exactly 1,
 * otherwise `rgba(r, g, b, a)`. r/g/b are rounded to nearest integer.
 */
export const format = (rgba: RGBA): Color => {
  const r = clampByte(rgba.r);
  const g = clampByte(rgba.g);
  const b = clampByte(rgba.b);
  const a = clampAlpha(rgba.a);
  if (a === 1) {
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

/** Linear interpolation between two RGBA values in straight-alpha sRGB-byte space. */
export const mix = (a: RGBA, b: RGBA, t: number): RGBA => ({
  r: a.r + (b.r - a.r) * t,
  g: a.g + (b.g - a.g) * t,
  b: a.b + (b.b - a.b) * t,
  a: a.a + (b.a - a.a) * t,
});

export const withAlpha = (color: RGBA, alpha: number): RGBA => ({ ...color, a: alpha });

// --- helpers ---

const parseHexByte = (s: string): number => parseInt(s, 16);

const clampByte = (n: number): number => {
  const r = Math.round(n);
  if (r < 0) return 0;
  if (r > 255) return 255;
  return r;
};

const clampAlpha = (n: number): number => {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
};

const toHex = (n: number): string => n.toString(16).padStart(2, "0");
