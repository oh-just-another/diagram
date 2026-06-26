---
"@oh-just-another/state": minor
---

Rotate shapes interactively. A rotate grip floats above the selection (single shape or group); dragging it turns the selection about its bounding-box centre, and holding **Shift** snaps the angle to 15° steps. The engine API `Editor.rotateSelection(angle)` drives the same maths programmatically. Element rotation was already modelled and rendered — this adds the handle, the gesture, and the hit-testing (the grip takes priority over the link-start anchors it overlaps).
