/**
 * `@oh-just-another/tokens` — single source of truth for every colour
 * hex that ships in the editor. L0 (zero project deps), built on
 * top of [Radix Colors](https://www.radix-ui.com/colors).
 *
 * Consumers import named tokens — `UI_ACCENT.light.accent`,
 * `HUE_TONES.dark.iris.solid`, `DEFAULT_SHAPE_STYLES.rectangle`,
 * `GRID_COLOR` — never raw hex. To re-skin the editor, edit
 * `colors.ts`; every package picks the change up.
 *
 * CSS-level mirrors (`packages/react-ui/src/styles.css`'s `--du-*`
 * variables) are hand-copied because CSS can't import TypeScript.
 * Comments in that file point back to the token names — keep them
 * in sync.
 */
export * from "./colors.js";
