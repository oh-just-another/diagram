---
"@oh-just-another/scene": minor
"@oh-just-another/renderer-core": minor
"@oh-just-another/serialization": minor
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
---

Embedded shape labels and grouped style controls. Rectangles, ellipses, polygons and block arrows can now carry text inside their body (`ElementBase.label` — full text stack: wrapping, styled runs, lists, highlight; centered by default with `textAlign` / `textBaseline` overrides). Double-click opens the same inline editor text elements use (typing, caret, selection, Tab-nesting all work; an emptied label is stripped on commit). Labels render on every backend and serialize. The wire schema also gained the element-level `locked` / `hidden` flags that previously failed strict validation. The shape toolbar now groups border editing (color / width / dash / corners) and fill (color / opacity) into two popovers.
