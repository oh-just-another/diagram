/**
 * Element + canvas color palettes used by the bundled
 * `<ColorSwatchPicker>`. Hosts that want a custom palette import
 * these constants and concat their own; the picker accepts any
 * `readonly string[]`.
 *
 * The "element" palettes target shape fill / stroke; they're
 * standard-inspired, tuned for legibility on the matching
 * canvas background. The "canvas" palettes target the editor's own
 * surface (paper colour + grid lines) — fewer entries because the
 * canvas needs a calm backdrop, not a graphic-design palette.
 *
 * `"transparent"` is the canonical "no colour" sentinel — the picker
 * renders it as a checkerboard swatch and writes the string
 * `"transparent"` into the underlying style. Same value the
 * `WebGL2Target.parseColor` and Canvas2D both treat as zero-alpha.
 */

/**
 * Light-theme element palette — colours that look right on a
 * paper-white canvas. Pinned hues taken from Mantine's open-source
 * palette so they read as a coherent family.
 */
export const ELEMENT_PALETTE_LIGHT: readonly string[] = [
  "transparent",
  "#1e1e1e",
  "#e03131",
  "#2f9e44",
  "#1971c2",
  "#f08c00",
  "#9c36b5",
  "#0c8599",
  "#fab005",
  "#868e96",
  "#ffffff",
];

/**
 * Dark-theme element palette — same hue family as
 * `ELEMENT_PALETTE_LIGHT` but lightened so they retain contrast
 * against a near-black surface.
 */
export const ELEMENT_PALETTE_DARK: readonly string[] = [
  "transparent",
  "#ffffff",
  "#ff6b6b",
  "#51cf66",
  "#4dabf7",
  "#ffa94d",
  "#cc5de8",
  "#3bc9db",
  "#ffd43b",
  "#adb5bd",
  "#1e1e1e",
];

/**
 * Light-theme canvas palette — paper-like backgrounds for the
 * editor surface. Pure white sits first; the rest are off-white
 * tints commonly used in note-taking / whiteboard apps.
 */
export const CANVAS_PALETTE_LIGHT: readonly string[] = [
  "#ffffff",
  "#f8f9fa",
  "#fff9db",
  "#fff5f5",
  "#f3f0ff",
  "#ebfbee",
  "#e7f5ff",
];

/**
 * Dark-theme canvas palette — near-black backgrounds. The first
 * entry matches `--du-canvas-bg` in the bundled stylesheet so
 * picking it visually keeps the canvas the default tone.
 */
export const CANVAS_PALETTE_DARK: readonly string[] = [
  "#121212",
  "#1a1a1a",
  "#1f1d36",
  "#1a1f1d",
  "#1f1a1d",
  "#1a1d22",
  "#212529",
];

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
