---
"@oh-just-another/react-ui": patch
"@oh-just-another/editor": patch
---

Toolbar action buttons and the zoom controls no longer re-render on every editor change: action buttons re-render only when their pressed/disabled state actually flips, and the zoom pill subscribes to the zoom value alone — a whole-editor subscription re-rendered them on every frame of an element drag.
