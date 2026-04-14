/**
 * Curated colour tokens — single source of truth for every hex
 * the project ships. Built on top of [Radix Colors](https://www.radix-ui.com/colors).
 *
 * Radix scales follow a consistent 12-step semantic model:
 *   step 1-2  app background / subtle background
 *   step 3-5  UI element backgrounds (hover / active)
 *   step 6-8  borders / separators / hovered borders
 *   step 9    "solid" — the main brand-ish colour, used for marks /
 *             text on a light surface; stays the same hex on both
 *             light and dark themes
 *   step 10-12 hovered solid / low- and high-contrast text
 *
 * Stable subsets are picked here so the rest of the codebase imports
 * named tokens (`UI.accent.solid`, `ELEMENT_FILL.iris.light`, …)
 * instead of raw hex strings. To re-skin the editor, change the
 * mapping below in one place — every package picks it up.
 */
import {
  amber,
  amberDark,
  cyan,
  cyanDark,
  grass,
  grassDark,
  gray,
  grayDark,
  iris,
  irisDark,
  plum,
  plumDark,
  tomato,
  tomatoDark,
} from "@radix-ui/colors";

/** Hue families exposed to the rest of the codebase. */
export const HUES = [
  "tomato",
  "amber",
  "grass",
  "cyan",
  "iris",
  "plum",
  "gray",
] as const;
export type Hue = (typeof HUES)[number];

/**
 * Per-hue paired tones for shape fills + strokes. Fills use the
 * "subtle" step-4 (pastel on light, deep-tinted on dark). Strokes /
 * solids use step-9, which is layout-consistent across themes.
 */
export interface HueTones {
  /** Subtle fill — step-4 (pastel on light, deep-tinted on dark). */
  readonly fill: string;
  /** Solid stroke / mark — step-9 (same hex in both themes). */
  readonly solid: string;
  /** Hovered solid — step-10. */
  readonly solidHover: string;
  /** Low-contrast text on subtle fill — step-11. */
  readonly textLow: string;
  /** High-contrast text — step-12. */
  readonly textHigh: string;
}

/** Read a required scale step, failing loudly if the token is absent. */
const step = (s: Record<string, string>, key: string): string => {
  const v = s[key];
  if (v === undefined) throw new Error(`Missing color token: ${key}`);
  return v;
};

const hueLight = (s: Record<string, string>, name: Hue): HueTones => ({
  fill: step(s, `${name}4`),
  solid: step(s, `${name}9`),
  solidHover: step(s, `${name}10`),
  textLow: step(s, `${name}11`),
  textHigh: step(s, `${name}12`),
});

/** Lookup `{ hue → tones }` for a given theme. */
export const HUE_TONES = {
  light: {
    tomato: hueLight(tomato, "tomato"),
    amber: hueLight(amber, "amber"),
    grass: hueLight(grass, "grass"),
    cyan: hueLight(cyan, "cyan"),
    iris: hueLight(iris, "iris"),
    plum: hueLight(plum, "plum"),
    gray: hueLight(gray, "gray"),
  },
  dark: {
    tomato: hueLight(tomatoDark, "tomato"),
    amber: hueLight(amberDark, "amber"),
    grass: hueLight(grassDark, "grass"),
    cyan: hueLight(cyanDark, "cyan"),
    iris: hueLight(irisDark, "iris"),
    plum: hueLight(plumDark, "plum"),
    gray: hueLight(grayDark, "gray"),
  },
} as const satisfies Record<"light" | "dark", Record<Hue, HueTones>>;

/**
 * Per-hue step-2 backgrounds — the "almost-pure tint" row used by
 * the canvas palette picker. Step-2 is Radix's "subtle app
 * background" — paper-like in light mode, deep-near-black in dark.
 * Exposed separately from `HUE_TONES` because shape fills (step-4)
 * and canvas backgrounds (step-2) have different aesthetic
 * intents — same hue, very different role.
 */
export const CANVAS_TONES = {
  light: {
    tomato: tomato.tomato2,
    amber: amber.amber2,
    grass: grass.grass2,
    cyan: cyan.cyan2,
    iris: iris.iris2,
    plum: plum.plum2,
    gray: gray.gray2,
  },
  dark: {
    tomato: tomatoDark.tomato2,
    amber: amberDark.amber2,
    grass: grassDark.grass2,
    cyan: cyanDark.cyan2,
    iris: irisDark.iris2,
    plum: plumDark.plum2,
    gray: grayDark.gray2,
  },
} as const satisfies Record<"light" | "dark", Record<Hue, string>>;

// ---------------------------------------------------------------------------
// UI surface tokens — used by react-ui's chrome (toolbar, panels,
// modals, tooltips). Intentionally curated, not a full scale: every UI
// surface picks from a small fixed set so themes stay coherent.
//
// CSS in react-ui's styles.css mirrors these hex values by hand
// (CSS can't import TypeScript). The comments next to each
// declaration there point back to the token name — keep them in
// sync when you change a value here.
// ---------------------------------------------------------------------------

export interface UISurface {
  /** Canvas / page background. */
  readonly canvas: string;
  /** Floating UI background (top bar, panels, popovers). */
  readonly bg: string;
  /** Solid version when transparency would be a problem. */
  readonly bgSolid: string;
  /** Subtle border around floating chrome. */
  readonly border: string;
  /** Body text on the bg. */
  readonly text: string;
  /** Secondary / placeholder text. */
  readonly textMuted: string;
  /** Hover tint inside button-groups / flat buttons. */
  readonly hoverOverlay: string;
}

export interface UIAccent {
  /** Primary accent — focus rings, links. */
  readonly accent: string;
  /** Hovered accent. */
  readonly accentHover: string;
  /** Selected / active background (tonal, not saturated). */
  readonly selectedBg: string;
  /** Foreground colour on top of `selectedBg`. */
  readonly selectedFg: string;
  /** Danger / destructive (delete, leave). */
  readonly danger: string;
}

export const UI_SURFACE = {
  light: {
    canvas: "#f5f5f5",
    bg: "rgba(255, 255, 255, 0.95)",
    bgSolid: "#ffffff",
    border: "rgba(0, 0, 0, 0.08)",
    text: "#1a1a1a",
    textMuted: "#6b6b6b",
    hoverOverlay: "rgba(0, 0, 0, 0.05)",
  },
  dark: {
    canvas: "#121212",
    bg: "rgba(35, 35, 35, 0.95)",
    bgSolid: "#252525",
    border: "rgba(255, 255, 255, 0.08)",
    text: "#e8e8e8",
    textMuted: "#9a9a9a",
    hoverOverlay: "rgba(255, 255, 255, 0.06)",
  },
} as const satisfies Record<"light" | "dark", UISurface>;

export const UI_ACCENT = {
  light: {
    accent: iris.iris9,
    accentHover: iris.iris10,
    selectedBg: iris.iris4,
    selectedFg: iris.iris11,
    danger: tomato.tomato9,
  },
  dark: {
    accent: irisDark.iris9,
    accentHover: irisDark.iris10,
    selectedBg: irisDark.iris4,
    selectedFg: irisDark.iris11,
    danger: tomatoDark.tomato9,
  },
} as const satisfies Record<"light" | "dark", UIAccent>;

// ---------------------------------------------------------------------------
// Renderer tokens — colours baked into renderer output (grid,
// default shape styles for newly-created shapes). Theme-agnostic
// because the renderer doesn't have a theme context; the canvas
// content is the user's document, not the chrome around it. Picked
// to read on both light and dark canvases.
// ---------------------------------------------------------------------------

/**
 * Grid colour — neutral gray. Step-6 reads as a calm grid line
 * on a paper-white canvas and stays visible on a near-black one.
 * Single hex for both themes.
 */
export const GRID_COLOR = gray.gray6;

/**
 * Dot-grid colour — deliberately darker than {@link GRID_COLOR}.
 * A lone dot covers far less area than a ruled line, so at the
 * line colour (step-6) the dots read as a faint, low-contrast
 * haze on a gray canvas. Step-9 ("solid") gives each dot enough
 * weight to be a legible anchor without turning the field busy.
 */
export const GRID_DOT_COLOR = gray.gray9;

/**
 * Default shape styles applied when a user draws a new shape
 * with the toolbar. The user can override anything via the
 * property panel afterwards.
 *
 * Fills use light-theme step-3 (very subtle pastel) so they read
 * cleanly on a paper-white canvas; strokes use step-9 (solid
 * brand colour). Sticky note uses amber for that classic
 * yellow paper feel.
 */
export interface DefaultElementStyle {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
}

export const DEFAULT_ELEMENT_STYLES = {
  rectangle: {
    fill: iris.iris3,
    stroke: iris.iris9,
    strokeWidth: 2,
  },
  ellipse: {
    fill: tomato.tomato3,
    stroke: tomato.tomato9,
    strokeWidth: 2,
  },
  flowchart: {
    fill: grass.grass3,
    stroke: grass.grass9,
    strokeWidth: 2,
  },
  sticky: {
    fill: amber.amber3,
    stroke: amber.amber9,
    strokeWidth: 1,
  },
} as const satisfies Record<string, DefaultElementStyle>;

/**
 * Default style for a freshly-created edge — neutral dark gray
 * line so it reads on most canvas backgrounds without competing
 * with the connected shapes' brand colours. step-12 of `gray`
 * gives ink-like contrast on paper-white.
 */
export const DEFAULT_EDGE_STYLE = {
  stroke: gray.gray12,
  strokeWidth: 1.5,
} as const;

/**
 * Semantic colours for the scene-diff overlay (`<DiffPanel>`):
 * `added` (green), `removed` (red), `modified` (amber). Picked
 * from step-9 of grass / tomato / amber so the three markers
 * stay legible side by side on a paper-white background.
 */
export const DIFF_COLORS = {
  added: grass.grass9,
  removed: tomato.tomato9,
  modified: amber.amber9,
} as const satisfies Record<"added" | "removed" | "modified", string>;
