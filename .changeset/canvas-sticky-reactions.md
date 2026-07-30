---
"@oh-just-another/renderer-core": minor
"@oh-just-another/react-ui": minor
"@oh-just-another/editor": minor
"@oh-just-another/state": minor
---

Sticky reaction pills and the "+" add-reaction button are now painted by the canvas renderer (single visual source that tracks the shape 1:1 while dragging; pills also reach PNG / SVG exports); the DOM overlay only lays transparent click zones over the same rects (`stickyReactionLayout`) and hosts the emoji picker. Pills keep a constant on-screen size across zoom (low-zoom clamp `STICKY_REACTION_MIN_ZOOM`) and wrap onto new rows inline-block style instead of being dropped. The "+" button is hover-only chrome: shown for the sticky under the idle cursor (`Editor.hoveredStickyId` → `RenderSceneOptions.hoveredElement`), excluded from exports and read-only views. Static exports gained content switches (`RenderSceneOptions.content`, defaults in `EXPORT_CONTENT_DEFAULTS`) toggling sticky reactions / tags / author, wired to "Include in export" checkboxes in the Export… menu and to `downloadPng` / `downloadSvg` / `exportSceneToPng`.
