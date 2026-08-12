---
"@oh-just-another/react-ui": minor
"@oh-just-another/editor": patch
---

One spacing system for every menu surface. New `--du-menu-*` tokens (panel padding 6, min-width 220, row height 36 = button size, row padding 10, icon / check gutter 20, gap 8, font 13 / shortcut 11, separator 6) and `--du-modal-*` tokens (16×20 padding, radius 14, gap 12), with shared `.du-menu-panel` / `.du-menu-row` / `.du-menu-gutter` / `.du-menu-shortcut` / `.du-menu-sep` / `.du-menu-group-title` / `.du-modal-header` / `.du-modal-body` classes. The context menu, `MainMenu` (main and zoom menus), the Shapes and lines flyout, popover list rows and the Help dialog all use them, so rows, gutters and separators line up across the UI. The zoom-percentage trigger is flat like its neighbours.
