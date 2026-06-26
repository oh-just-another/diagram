---
"@oh-just-another/state": minor
---

Resizing a rotated shape now works correctly. Dragging a handle on a rotated
element resizes it in the element's own (un-rotated) frame and keeps the corner
opposite the dragged handle fixed in world — the same "the other side stays put"
feel as for an unrotated shape. Aspect-lock (Shift) and resize-from-centre (Alt)
are honoured in the rotated frame too. Previously a rotated shape jumped because
the resize math assumed an axis-aligned box.
