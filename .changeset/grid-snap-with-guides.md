---
"@oh-just-another/state": patch
---

Snapping fixes while dragging:

- Grid snapping no longer stops while alignment guides are showing — object snapping lands per axis, so a shape aligned to a neighbour horizontally still snaps to the grid vertically (same for group moves and resizes, where a size match owns only the axis it sized).
- Alignment guides and their distance segments now describe where the shape actually landed instead of the raw pointer position, so a measured gap is the real gap between the two shapes.
- A guide stays lit while the shapes remain aligned (e.g. the grid holds the alignment) instead of vanishing as soon as the object snap stops correcting.
