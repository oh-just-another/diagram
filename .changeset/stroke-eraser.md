---
"@oh-just-another/state": minor
---

Stroke-eraser: holding Shift while erasing cuts brush strokes into fragments instead of deleting the whole element. Each brush point within the eraser capsule (radius = the on-screen eraser ring in world units, widened by the point's own half-width) is removed; surviving points split into fragment strokes (a lone kept point becomes a dot), links bound to a cut brush are detached, and it all lands in one undo step. A live preview shows the cut while you drag (touched originals hidden, fragments shown). Without Shift the eraser still deletes whole elements; non-brush shapes under Shift fall back to whole-element erase.
