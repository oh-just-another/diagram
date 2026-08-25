---
"@oh-just-another/state": minor
"@oh-just-another/react-ui": patch
---

"Back to content" jumps to the element nearest the camera instead of fitting the whole scene: new `Editor.revealNearestContent(padding = 80)` (pure `computeRevealNearest` / `nearestElementBounds` in `zoom-pan`) centres that element at the current zoom, zooming out only when it does not fit — a lone small shape is no longer blown up to full screen and a large board is no longer shrunk to a speck. `ResetToContentButton` calls it.
