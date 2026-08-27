---
"@oh-just-another/react-ui": minor
---

`LayerPanel`, `CommentsPanel`, `CommentsPopover` and `Sidebar` drop their inline legacy styles for the shared side-panel chrome: `du-side-panel du-side-panel-static` cards, 40-px `du-panel-row` list rows with the menu hover / tonal selected states, `du-panel-input`, the new `du-button` / `du-button-primary` text button (also used by the merge dialog footer and sidebar tabs), and `du-thread*` for the floating thread. Icon glyphs replace the `+` / `×` / `⌄` text buttons. Sizes moved to CSS tokens (`--du-sidebar-w`, `--du-thread-w`, `--du-panel-row-h`); the `LAYER_PANEL_WIDTH`, `LAYER_TOGGLE_ICON_SIZE`, `LAYER_SWATCH_SIZE`, `COMMENTS_PANEL_WIDTH` exports are removed.
