---
"@oh-just-another/state": patch
"@oh-just-another/react-ui": patch
---

Search navigation no longer blows a small match up to fill the whole canvas. Jumping to a match now centers it while preserving the current zoom, only zooming out when the match is too large to fit — a small element stays small and just lands in the center. Adds `Editor.revealSelection(padding)` and the pure `computeRevealBounds` helper (never zooms in, unlike `zoomToSelection`'s fit-to-fill).
