---
"@oh-just-another/react-ui": minor
"@oh-just-another/editor": minor
---

New `<DrawingPanel>` — a floating tool-options panel that appears while the brush or eraser is active. It edits `editor.brushSettings` (via the new `useBrushSettings` hook): line colour, enclosed-fill colour, opacity and width for the brush; only the width (which doubles as the eraser radius) for the eraser. `<Diagram>` mounts it automatically top-right, hidden in zen mode; opt out with the new `hideDrawingPanel` prop. This is a functional scaffold intended for restyling.
