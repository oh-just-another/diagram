---
"@oh-just-another/state": patch
---

Fix the eraser cursor freezing when you pause mid-drag (button held) and then resume. The fading trail could empty during the pause, and the resumed move then had neither an active trail nor an object change, so it never triggered a repaint — the cursor stuck until release, when the whole cut applied at once. The eraser now always repaints on move (so the ring follows the pointer) and restarts the trail if it had faded.
