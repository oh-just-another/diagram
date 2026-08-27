---
"@oh-just-another/react-ui": patch
"@oh-just-another/editor": patch
---

Distance tokens for the chrome: `--du-dock-inset` (14px, canvas edge → vertical tool dock), `--du-flyout-gap` (14px, a bar → the menu / flyout it opens: Shapes and lines, main and zoom menus) and `--du-submenu-gap` (10px, parent menu column → nested menu). Nested menus no longer overlap their parent column after the tighter menu inset; the context-menu submenu reads its alignment from the live panel instead of a hard-coded 7px; the dock clears an open library by its real inset + width instead of a stale 12px constant.
