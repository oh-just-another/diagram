---
"@oh-just-another/react-ui": patch
---

`MainMenu` panels (root and nested) render through the portal container and position with `floatPanel`, like the context menu: they now stack at `--du-z-popover` above the selection floating toolbar and the minimap, flip / shift inside the viewport, and read their gaps (`--du-flyout-gap`, `--du-submenu-gap`) from the CSS tokens via the shared `cssPx` helper. Click-outside treats every open panel as inside the menu.
