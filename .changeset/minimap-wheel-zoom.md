---
"@oh-just-another/react-ui": patch
---

The minimap now supports wheel zoom: scrolling over it zooms the main view into the world spot under the cursor (recentering there first, matching its click-to-pan), using the same delta→factor curve as the main canvas. The handler is a non-passive listener so it doesn't scroll the page, and doesn't interfere with click/drag panning. Tunable via `MINIMAP_WHEEL_ZOOM_SPEED` / `MINIMAP_WHEEL_ZOOM_MAX_STEP`.
