---
"@oh-just-another/react-ui": patch
---

Fix canvas flicker on container / window resize. The `ResizeObserver` callback
now repaints synchronously (`editor.forceRender()`) instead of deferring to the
next animation frame — `surface.resize()` clears the canvas immediately, so a
deferred render let the cleared frame paint first, producing one blank frame per
resize event.
