---
"@oh-just-another/renderer-canvas": patch
---

WebGL2 bitmap-path text (emoji, strings with unbaked glyphs, no-MSDF fallback) is now rasterised at the current effective screen scale (view zoom × devicePixelRatio, quantised to powers of two, capped by `WEBGL2_TEXT_RASTER_MAX_SCALE`) instead of a fixed 1× bake, so sticky reaction pills and other small labels stay sharp under zoom.
