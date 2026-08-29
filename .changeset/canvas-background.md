---
"@oh-just-another/scene": minor
"@oh-just-another/serialization": patch
"@oh-just-another/state": minor
"@oh-just-another/editor": minor
"@oh-just-another/headless": patch
---

Canvas paper colour per scene: `viewport.background` (serialised, additive; `DEFAULT_CANVAS_BACKGROUND` / `canvasBackgroundOf` in `scene`), `Editor.setCanvasBackground(color | null)` / `Editor.canvasBackground` with undo, a Board › Background color submenu (`CANVAS_BACKGROUND_PRESETS`) that also drives the editor root's `--du-canvas-bg`, and "with background" PNG exports plus headless `renderToPng` that paint the scene colour by default.
