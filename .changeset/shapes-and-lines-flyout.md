---
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
"@oh-just-another/editor": patch
---

"Shapes and lines" toolbar button (reference behaviour): replaces the separate rectangle / ellipse / connector buttons with one trigger opening a flyout beside the toolbar — Line / Arrow / Elbow arrow (connector presets: routing + arrowhead, applied to new links AND the live preview via `Editor.armLineTool`), Rectangle / Oval / Rhombus / Triangle (`Editor.armShapeTool` — diamond and triangle draw as inscribed polygons through the same rubber-band gesture), and "More shapes" opening the template library (the standalone library toggle is gone from the dock — "More shapes" is now its only toolbar entry point; `hideLibraryButton` removes that row). Hotkeys R / O / L keep arming the stock tools; any tool switch resets the armed variant.
