---
"@oh-just-another/state": minor
---

Canvas cursor matrix aligned with the reference board, system keywords only. Resize arrows now follow the shape's rotation (`cursorForHandle(handle, rotation)` snaps the handle's outward direction to the nearest 45° screen sector), moving an element / link / caption keeps the plain arrow (only panning shows `grabbing`), rubber-band selection shows a crosshair, the selected link's caption shows an I-beam, and a read-only board behaves like the hand tool (`grab`). `isOverSelectedLinkLabel` is shared by the pointer binding and the cursor so both agree on the caption hit area.
