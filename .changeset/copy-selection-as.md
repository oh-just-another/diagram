---
"@oh-just-another/editor": minor
"@oh-just-another/react-ui": patch
---

Context menu rows "Copy as PNG", "Copy as SVG" and "Copy as text" copy the selection to the clipboard (transparent retina PNG; fitted SVG markup as text; text / labels one per line). New editor exports `copySelectionAsPng` / `copySelectionAsSvg` / `copySelectionAsText`, `selectionText`, `sceneToSvgMarkup`, `subsetScene`, `sceneBounds`, `fitViewportTo`, registered as `copy-as-png` / `copy-as-svg` / `copy-as-text` actions. The react-ui context menu shows the rows when the host registered those actions.
