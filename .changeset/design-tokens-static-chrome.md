---
"@oh-just-another/react-ui": minor
"@oh-just-another/editor": patch
---

Design tokens for the static chrome. The `:root` block of `styles.css` is now one documented token sheet grouped by type — colour (surfaces, text, accent, inverse), elevation, radius, spacing scale, control sizing, typography, layout (`--du-bar-height`, `--du-bar-clear`, `--du-side-panel-w`), menus, popovers, modals, toasts, tooltip, z-index scale and motion. Every hard-coded value in the mode toolbars, zoom controls, minimap, top bars, help / merge dialogs, `Modal`, `Toast`, `Tooltip`, `BottomSheet` and the tool-options dock now reads a token; their inline styles moved to classes (`du-modal-title/-subtitle/-close/-footer`, `du-toast*`, `du-sheet-*`, `du-minimap-dock`, `du-tool-options-dock`, `du-zoom-*`, `du-toolbar-divider`, `du-brand`). Removed the unused `TOOLBAR_SEPARATOR_HEIGHT` export — the separator height is `--du-icon-size`.
