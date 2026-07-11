---
"@oh-just-another/scene": minor
"@oh-just-another/state": patch
"@oh-just-another/renderer-core": patch
---

The live brush-stroke preview now paints in the chosen palette colour and opacity instead of a hardcoded dark-grey fill, so it matches the committed stroke. The brush body colour resolution is now a single shared `brushBodyColor(style)` helper (exported from `@oh-just-another/scene`) used by both the committed-stroke renderer and the preview, so the two can't drift.
