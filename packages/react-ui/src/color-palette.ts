/**
 * Element + canvas color palettes used by the bundled
 * `<ColorSwatchPicker>`. Hosts that want a custom palette import
 * these constants and concat their own; the picker accepts any
 * `readonly string[]`.
 *
 * Palette is sourced from `@oh-just-another/tokens` — see that package
 * for the underlying Radix mapping. Each hue carries two pinned
 * tones — step-4 ("subtle") for fills and step-9 ("solid") for
 * strokes / marks. Step-9 stays the same hex on both themes per
 * Radix spec, so the picker reads as the same "brand" colour
 * regardless of the active theme.
 *
 * `"transparent"` is the canonical "no colour" sentinel — the picker
 * renders it as a checkerboard swatch and writes the string
 * `"transparent"` into the underlying style.
 */
import { CANVAS_TONES, HUES, HUE_TONES } from "@oh-just-another/tokens";

const fillsLight = HUES.map((hue) => HUE_TONES.light[hue].fill);
const solidsLight = HUES.map((hue) => HUE_TONES.light[hue].solid);
const fillsDark = HUES.map((hue) => HUE_TONES.dark[hue].fill);
const solidsDark = HUES.map((hue) => HUE_TONES.dark[hue].solid);

const canvasLight = HUES.map((hue) => CANVAS_TONES.light[hue]);
const canvasDark = HUES.map((hue) => CANVAS_TONES.dark[hue]);

/**
 * Light-theme element palette: step-4 subtle tints first row,
 * step-9 solids second row, neutrals + transparent last row.
 */
export const ELEMENT_PALETTE_LIGHT: readonly string[] = [
  ...fillsLight,
  ...solidsLight,
  "#ffffff",
  "#1e1e1e",
  "transparent",
];

/**
 * Dark-theme element palette — step-4 dark tints for fills,
 * step-9 dark for solids. Per Radix spec, the step-9 hex matches
 * the light variant so brand colour stays anchored across themes;
 * only the tint row swaps to deep-tinted backgrounds.
 */
export const ELEMENT_PALETTE_DARK: readonly string[] = [
  ...fillsDark,
  ...solidsDark,
  "#1e1e1e",
  "#ffffff",
  "transparent",
];

/**
 * Light-theme canvas palette — paper-like backgrounds for the
 * editor surface. Pure white sits first; the rest are step-2 hues
 * (almost-pure tints with a hint of colour). Meant for the canvas
 * itself, not for shapes.
 */
export const CANVAS_PALETTE_LIGHT: readonly string[] = ["#ffffff", ...canvasLight];

/**
 * Dark-theme canvas palette — near-black backgrounds. Step-2 dark
 * from each Radix hue: deep, almost-neutral tints that read as
 * "themed background" rather than "filled colour".
 */
export const CANVAS_PALETTE_DARK: readonly string[] = ["#121113", ...canvasDark];

/**
 * Resolve which palette flavour to use given a `theme` setting
 * ("light" / "dark" / "system"). For `"system"` consults the OS
 * `prefers-color-scheme` media query, re-checked on each call so a
 * host that re-renders on theme change picks up the switch without
 * subscribing.
 */
export const resolvePaletteTheme = (
  theme: "light" | "dark" | "system",
): "light" | "dark" => {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};
