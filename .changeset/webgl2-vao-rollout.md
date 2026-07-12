---
"@oh-just-another/renderer-canvas": patch
---

WebGL2: every pipeline (MSDF text, Loop-Blinn curves, strokes/fills via the
shared dynamic VBO, ellipses, image quads) now records its vertex layout into
its own VAO once at init and just binds it per draw — matching the rect-batch
discipline — instead of re-issuing `enableVertexAttribArray` +
`vertexAttribPointer` on every draw. Draw output is identical (golden-visual
suite passes pixel-for-pixel); this trims redundant GL state calls per frame.
