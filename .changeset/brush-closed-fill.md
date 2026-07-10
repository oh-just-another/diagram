---
"@oh-just-another/scene": minor
"@oh-just-another/serialization": minor
"@oh-just-another/state": minor
"@oh-just-another/renderer-core": patch
---

Brush strokes can now be closed and filled. When a fill colour is set in the drawing panel and a stroke's end is drawn back near its start (within `BRUSH_CLOSE_DISTANCE`), the committed `BrushElement` gets `closed: true` and the renderer fills the enclosed area with `style.fill` under the variable-width stroke body. Open strokes and strokes drawn without a fill colour are unchanged. `BrushElement.closed` is serialized.
