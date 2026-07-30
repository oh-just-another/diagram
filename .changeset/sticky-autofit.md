---
"@oh-just-another/scene": patch
"@oh-just-another/serialization": patch
"@oh-just-another/renderer-core": minor
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
---

Sticky auto-fit text. New stickies start in Auto mode (`ShapeLabel.autoFit`): the rendered font size is derived — binary search over the shared text layout, memoized — so the text fills the card and scales with it. Picking an explicit size in the toolbar leaves Auto (reference behaviour); the "Auto" button in the font-size popover returns to it (`Editor.setLabelAutoFit`). The sticky toolbar branch also gained the label text controls (font family, size, style, alignment).
