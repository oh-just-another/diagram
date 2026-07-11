---
"@oh-just-another/state": patch
---

The live brush-stroke preview is now Catmull-Rom-smoothed with the same resampler `commitBrushStroke` applies on release, so a stroke reads smooth as it's drawn instead of snapping from an angular polyline to a curve only when the pointer is lifted.
