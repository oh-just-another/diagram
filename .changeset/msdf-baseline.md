---
"@oh-just-another/renderer-canvas": patch
---

WebGL2 text now derives its baseline from the same browser font metrics Canvas2D uses (measured via `fontBoundingBox`), so text sits at the same vertical position — and reads the same line spacing — as the Canvas2D and offscreen backends.
