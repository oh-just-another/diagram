---
"@oh-just-another/react-ui": patch
---

Menu, submenu, flyout and list-row icons render on lucide's native 24-px grid (`ROW_ICON` 24 / 2) and marks on the half grid (`MARK_ICON` 12 / 2), so they are as crisp as the toolbar glyphs; the search-input glyph is 12 px. Dialogs stack above all floating chrome (`--du-z-modal` 1800, `--du-z-toast` 1900) — the selection toolbar no longer covers the Keyboard shortcuts dialog. The selection panel, popover and caption editor read their z-index from the tokens.
