---
"@oh-just-another/state": patch
---

Fix inline text editing on a scaled text element: the caret and selection highlight now apply the element's `scale`, so they line up with the rendered text instead of trailing behind it. Clicking to place the caret divides the point back through `scale` to hit the right glyph.
