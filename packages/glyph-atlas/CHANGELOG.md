# @oh-just-another/glyph-atlas

## 0.58.0

### Minor Changes

- 3ff16ab: MSDF glyph baking moved off the main thread. Profiling showed a single WASM MSDF bake costs 15–50 ms — over a frame budget no matter how the queue is paced — so the WebGL2 backend now ships bake requests to a dedicated worker (`glyph-bake-worker`, its own `WasmTextShaper` instance) and inserts the returned tiles via the new `GlyphAtlas.insertBaked`. The main thread never runs the rasteriser; strings with un-baked glyphs keep rendering through the cached bitmap path until their tiles arrive. Where workers are unavailable, a throttled one-glyph-per-macrotask fallback applies.

### Patch Changes

- 4c2b27b: WebGL2 text stability and interaction smoothness. Emoji strings are measured with Canvas2D (the MSDF atlas has no colour glyphs; its NaN advance crashed the render loop every frame, freezing the canvas and dropping emoji after the first pan). Per-glyph MSDF baking (~9 ms per glyph in WASM) no longer happens inside a frame at all: the atlas tracks coverage (`GlyphAtlas.has`), strings with un-baked glyphs draw and measure through the cached Canvas2D bitmap path for that frame while a background queue bakes the missing glyphs in small chunks (printable ASCII is pre-queued the moment the shaper loads). The first pan/zoom after load — and the first frame containing new characters — no longer stutters.

## 0.57.0

### Minor Changes

- Version bump just for publishing.
