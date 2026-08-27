---
"@oh-just-another/react-ui": patch
---

The context menu stays inside the window: it flips above the press point when there is no room below, keeps `MENU_VIEWPORT_PADDING_PX` from every edge, and scrolls when the window is shorter than the menu. Submenus open to the left when the right side has no room and are clamped the same way. Positioning is shared with `Popover` through the new `floatPanel` helper.
