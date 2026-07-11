---
"@oh-just-another/state": patch
---

Stroke-eraser no longer freezes on longer drags. The live cut was recomputed against the entire eraser path every frame (O(points × path length)), so the main thread saturated as the path grew — the cursor froze and the whole cut applied at once on release. Erased points are now accumulated incrementally (each move tests only the new segment, skipping already-erased points), making the per-move cost O(points) and the preview smooth throughout the drag.
