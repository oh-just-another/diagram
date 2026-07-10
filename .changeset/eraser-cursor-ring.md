---
"@oh-just-another/state": minor
---

The eraser now shows an Excalidraw-style cursor instead of the generic crosshair: a grey ring that follows the pointer, sized to the panel's eraser width (`brushSettings.width`), plus a short fading grey trail while you drag. The OS cursor is hidden in erase mode (`cursor: none`) and the ring/trail are painted on the overlay so any radius composites cleanly. The laser and eraser trails now share one `drawFadingTrail` renderer. New `CursorRole` `"erase"`.
