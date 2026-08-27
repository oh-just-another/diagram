---
"@oh-just-another/state": patch
"@oh-just-another/react-ui": patch
---

The Shapes and lines flyout marks the armed tool: the row matching the current shape kind or line preset is `menuitemradio` + `aria-checked` with the tonal selected style (stock `draw-edge` reads as Elbow arrow). `armShapeTool` / `armLineTool` notify subscribers once more after the variant is set, so listeners never observe the reset value.
