---
"@oh-just-another/renderer-canvas": minor
---

WebGL2Target: instanced batching of axis-aligned rect fills. Consecutive same-frame sharp `rect()` + `fill()` calls now coalesce into one `drawArraysInstanced` (unit quad + per-instance projected affine + RGBA), replacing one `drawArrays` per rect. Any intervening non-batchable draw (stroke, ellipse / polygon / curve fill, image, text) and every surface op (`clear`, `resize`, frame `present`) drain the queue first, so draw order (z-order) is unchanged. `LayeredSurface.present()` flushes the batch at frame end. Rounded rects (curve path) and stroked outlines are unaffected. Transparent — no `RenderTarget` API change.
