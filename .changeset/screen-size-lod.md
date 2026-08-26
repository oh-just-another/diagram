---
"@oh-just-another/renderer-core": minor
"@oh-just-another/state": minor
---

Level of detail is decided per element from its size on screen, not from the zoom level. `LodOptions` is now `{ placeholderMaxScreenPx, minTextScreenPx }` (the zoom thresholds `placeholder` / `hideText` are gone): a shape whose longer side is below `placeholderMaxScreenPx` (default 8 px) on screen becomes a flat AABB fill; text — standalone and embedded shape labels, on the resolved font size — below `minTextScreenPx` (default 6 px) is skipped. A huge shape or a giant heading therefore stays fully drawn at 1 % while small ones degrade first. Helpers `screenSizeOf` / `isTextBelowLod` and the `LOD_*_SCREEN_PX` constants are exported. `MIN_ZOOM` drops from 5 % to 1 %.
