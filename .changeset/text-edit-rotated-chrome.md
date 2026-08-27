---
"@oh-just-another/state": patch
---

Caret and selection highlight now rotate with a rotated text element (or label) while editing, and canvas clicks map to the right glyph through the element rotation. `editingTextOverlay()` exposes the new `EditingTextOverlay` type with `rotation` + `pivot`.
