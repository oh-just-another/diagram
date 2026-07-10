---
"@oh-just-another/state": patch
---

The laser and eraser trails now render like Excalidraw — one filled comet shape per stroke instead of a stack of alpha-blended segments. The smoothed centreline is offset into a single ribbon whose half-width tapers from the head to a pointed tail, filled once at a single opacity that fades by the freshest point's age. This removes the overlapping round-cap "beads" at every joint that made the trail look like a chain of little lasers.
