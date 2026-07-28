---
"@oh-just-another/renderer-canvas": patch
"@oh-just-another/glyph-atlas": patch
---

WebGL2 text stability and interaction smoothness. Emoji strings are measured with Canvas2D (the MSDF atlas has no colour glyphs; its NaN advance crashed the render loop every frame, freezing the canvas and dropping emoji after the first pan). Per-glyph MSDF baking (~9 ms per glyph in WASM) no longer happens inside a frame at all: the atlas tracks coverage (`GlyphAtlas.has`), strings with un-baked glyphs draw and measure through the cached Canvas2D bitmap path for that frame while a background queue bakes the missing glyphs in small chunks (printable ASCII is pre-queued the moment the shaper loads). The first pan/zoom after load — and the first frame containing new characters — no longer stutters.
