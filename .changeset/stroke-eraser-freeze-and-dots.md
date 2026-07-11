---
"@oh-just-another/state": patch
---

Two stroke-eraser fixes. (1) No more freeze on a slow or stopped cursor: the whole-scene repaint forced while erasing now happens only on frames that actually mark or cut something, not on every eraser move — a slow/idle cursor generates many pointer events per unit distance, each of which was re-rendering the entire scene. (2) Cutting a stroke no longer leaves isolated single-point dots: lone kept points (a survivor with both neighbours erased) are dropped instead of kept as stray discs.
