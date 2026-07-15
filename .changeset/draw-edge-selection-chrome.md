---
"@oh-just-another/state": patch
---

Fix: with a creation tool active (draw-edge, draw-rect, …) a press on a
selected shape's edge no longer grabs the shape's resize/rotate handle — it
starts the new link / element as expected. Selection chrome (resize, rotate,
group and selected-link endpoint handles) is now pressable only under the
select tool, and the overlay stops drawing the handles while a creation tool
is active (outlines stay; the hand tool keeps the chrome visible).
