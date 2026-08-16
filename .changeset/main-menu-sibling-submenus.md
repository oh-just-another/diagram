---
"@oh-just-another/react-ui": patch
---

`MainMenu` submenus are coordinated per level: hovering a sibling submenu opens it and closes the previous one at once (no overlapping panels); hovering a plain item closes the open submenu after the short delay.
