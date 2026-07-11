---
"@oh-just-another/state": patch
---

The stroke-eraser (Shift + erase over a brush) now cuts the stroke's **geometry by arc length** instead of dropping whole vertices. A large eraser that merely grazes a line — or one passing between two far-apart points on a fast/short stroke — removes exactly the span it covers, with the fragment edges pinned to the eraser ring. This fixes the eraser ignoring sparsely-sampled or short strokes and eating a gap unrelated to the disc size.
