---
"@oh-just-another/renderer-canvas": patch
---

`RecordingTarget.measureText` now measures on a hidden 2D context with the active font instead of returning a rough character-count estimate. On the offscreen backend this makes caret / selection geometry line up with the text the worker actually draws.
