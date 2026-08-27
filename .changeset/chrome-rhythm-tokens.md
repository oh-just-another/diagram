---
"@oh-just-another/react-ui": patch
---

Toolbars and menus now share one rhythm: `--du-control-size` (40px) is the toolbar button height, the menu row height (Shapes and lines flyout, context / main / zoom menus) and the panel list row height; `--du-chrome-pad` (4px) is both the inset of a toolbar button group and the inset around a menu's rows. Menu rows go from 44px to 40px and menu panels from 8px to 4px inner padding as a result.
