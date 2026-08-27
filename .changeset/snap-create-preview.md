---
"@oh-just-another/state": patch
---

Snap the live draw preview to the grid. The rubber-band shown while drawing a rect / ellipse / frame followed the raw cursor and only the final shape snapped on release, so drawing looked like grid snapping was off. The preview now goes through the same snap helper as the final CREATE, matching how move / resize snap live during the gesture.

Also restore the live preview for the frame tool: `isDrawingPhase` didn't include `draw-frame`, so no rubber-band appeared while drawing a frame. The frame preview renders as the real frame element (auto-numbered name included), WYSIWYG like rect / ellipse.
