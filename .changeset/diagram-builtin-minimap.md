---
"@oh-just-another/editor": minor
---

Add a built-in `minimap` prop to `<Diagram>`/`<Editor>`. When set, the minimap docks bottom-right above the zoom controls and is hidden in zen mode along with the rest of the chrome (it reads the editor from context). Previously hosts had to mount `<Minimap>` themselves, which sat outside the zen-gated chrome and overlapped the zoom pill. Off by default.
