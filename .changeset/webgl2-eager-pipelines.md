---
"@oh-just-another/renderer-canvas": patch
---

WebGL2: all shader pipelines (rect batch, curves, ellipses, MSDF text, image
quad) compile eagerly in the `WebGL2Target` constructor. A shader that can't
compile (driver quirk, context lost to the per-page WebGL context limit) now
fails at construction — where `createLayeredSurfaceWithFallback` catches it
and degrades to Canvas2D with a toast — instead of throwing mid-frame on the
first ellipse/text/image draw and killing the render loop.
