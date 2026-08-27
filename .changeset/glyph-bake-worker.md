---
"@oh-just-another/glyph-atlas": minor
"@oh-just-another/renderer-canvas": patch
---

MSDF glyph baking moved off the main thread. Profiling showed a single WASM MSDF bake costs 15–50 ms — over a frame budget no matter how the queue is paced — so the WebGL2 backend now ships bake requests to a dedicated worker (`glyph-bake-worker`, its own `WasmTextShaper` instance) and inserts the returned tiles via the new `GlyphAtlas.insertBaked`. The main thread never runs the rasteriser; strings with un-baked glyphs keep rendering through the cached bitmap path until their tiles arrive. Where workers are unavailable, a throttled one-glyph-per-macrotask fallback applies.
