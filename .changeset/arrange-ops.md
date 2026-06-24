---
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
---

Arrange operations for the selection. **Flip** mirrors the selection about its bounding-box centre — horizontal (`Shift+H`) and vertical (`Shift+V`); a single shape flips about its own centre. **Align** flushes two or more shapes to the left / right / top / bottom edge or the horizontal / vertical centre of their bounding box (`Alt+←/→/↑/↓` for the four edges; centres via the panel / menu). Both are available from the selection property panel and the right-click menu. New engine API: `Editor.flipSelection(axis)` and `Editor.alignSelection(edge)`.
