---
"@oh-just-another/state": patch
---

The stroke-eraser no longer eats more of a line than the cursor ring shows. A brush point was erased when the eraser capsule reached the stroke's outer EDGE (`radius + point.width`); now it's erased when the ring covers the point's centre (`radius`), which equals the visible cursor ring at every zoom. The eraser removes exactly the centreline it passes over.
