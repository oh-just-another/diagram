/**
 * `@oh-just-another/tokens` — single source of truth for every colour
 * hex that ships in the editor. L0, zero project deps.
 *
 * Consumers import named tokens — `UI_ACCENT.light.accent`,
 * `HUE_TONES.dark.iris.solid`, `DEFAULT_ELEMENT_STYLES.rectangle`,
 * `GRID_COLOR` — never raw hex. To re-skin the editor, edit
 * `colors.ts`; every package picks the change up.
 */
export {
  HUES,
  HUE_TONES,
  CANVAS_TONES,
  UI_SURFACE,
  UI_ACCENT,
  GRID_COLOR,
  GRID_DOT_COLOR,
  DEFAULT_ELEMENT_STYLES,
  DEFAULT_EDGE_STYLE,
  DIFF_COLORS,
} from "./colors.js";
export type { Hue, HueTones, UISurface, UIAccent, DefaultElementStyle } from "./colors.js";
