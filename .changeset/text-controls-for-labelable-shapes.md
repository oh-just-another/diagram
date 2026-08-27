---
"@oh-just-another/state": patch
"@oh-just-another/react-ui": patch
---

The selection toolbar shows the text controls for every shape type that can carry text (rectangle, ellipse, polygon, block arrow, sticky) even before it has any — they display the defaults the first text will take. `updateLabelStyle` / `updateLabelProps` / `setLabelAutoFit` seed the label on a labelable shape that has none (create-on-write); the inline editor and the style APIs share one `seedLabel`.
