# @oh-just-another/tokens

[![npm version](https://img.shields.io/npm/v/@oh-just-another/tokens.svg)](https://www.npmjs.com/package/@oh-just-another/tokens)

L0 colour tokens — single source of truth for every hex that ships in the editor. No project dependencies.

Consumers import named tokens (`UI_ACCENT.light.accent`, `HUE_TONES.dark.iris.solid`, `DEFAULT_ELEMENT_STYLES.rectangle`, `GRID_COLOR`) rather than raw hex. To re-skin the editor, edit `colors.ts` in one place and every package picks the change up.

> CSS-level mirrors (react-ui's `--du-*` variables) are hand-copied because CSS can't import TypeScript; keep them in sync.

## Install

```bash
pnpm add @oh-just-another/tokens
```

## Usage

```ts
import {
  HUE_TONES,
  UI_ACCENT,
  GRID_COLOR,
  DEFAULT_ELEMENT_STYLES,
  type Hue,
} from "@oh-just-another/tokens";

const stroke = HUE_TONES.light.iris.solid; // step-9 brand hex
const focusRing = UI_ACCENT.dark.accent;
const rectDefaults = DEFAULT_ELEMENT_STYLES.rectangle; // { fill, stroke, strokeWidth }
```

## Exports

| Name                                           | Notes                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `HUES`, `Hue`                                  | The seven exposed hue families (`tomato`, `amber`, `grass`, `cyan`, `iris`, `plum`, `gray`). |
| `HUE_TONES`, `HueTones`                        | Per-theme, per-hue tones for shape fills + strokes (`fill` / `solid` / `solidHover` / text). |
| `CANVAS_TONES`                                 | Per-hue step-2 backgrounds used by the canvas palette picker.                                |
| `UI_SURFACE`, `UISurface`                      | Chrome surface tokens (canvas, bg, border, text…) per theme.                                 |
| `UI_ACCENT`, `UIAccent`                        | Accent / selection / danger tokens per theme.                                                |
| `GRID_COLOR`, `GRID_DOT_COLOR`                 | Theme-agnostic grid line and dot colours.                                                    |
| `DEFAULT_ELEMENT_STYLES`, `DEFAULT_EDGE_STYLE` | Default styles for newly-drawn shapes and edges.                                             |
| `DIFF_COLORS`                                  | `added` / `removed` / `modified` markers for the scene-diff overlay.                         |
