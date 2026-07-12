---
"@oh-just-another/renderer-canvas": minor
"@oh-just-another/state": patch
---

Tile cache honours per-element hide (B12, hide half). `renderViaTiles` accepts
`hideElements`: tiles bake with the set applied, and an element entering or
leaving the set invalidates only the tiles it touches — so the stroke-eraser
preview and per-element visibility no longer drop very large scenes off the
tile-cache path into a full re-render every frame. Group-isolation dim still
takes the full path (dimming almost everything would re-rasterise most tiles
anyway).
