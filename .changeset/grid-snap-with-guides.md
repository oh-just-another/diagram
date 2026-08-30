---
"@oh-just-another/state": patch
---

Grid snapping no longer stops while alignment guides are showing: object snapping lands per axis, so a shape aligned to a neighbour horizontally still snaps to the grid vertically (same for group moves and resizes, where a size match owns only the axis it sized).
