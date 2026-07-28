---
"@oh-just-another/renderer-canvas": patch
"@oh-just-another/renderer-core": patch
"@oh-just-another/serialization": patch
"@oh-just-another/state": patch
---

Inline label editing behaves like a proper text box. The label's visible line window now scrolls to follow the caret (transient `metadata.labelScrollLines`, stripped on commit/cancel and on save), so arrowing to the end of a long label keeps the edited line on screen; selection highlight and the caret are clipped to the shape body. Double-click places a collapsed caret without arming a drag-select (no more accidental part-selection). Emoji now survive the WebGL2 backend: strings containing pictographs take the rasterised-bitmap text path instead of the monochrome MSDF atlas that cannot shape them.
