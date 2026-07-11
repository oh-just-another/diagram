---
"@oh-just-another/state": patch
---

Clicking a drawn line's (brush stroke's) link-start dot no longer clone-creates a connected element — duplicating a freehand line as a "node" made no sense. The start dots and dragging a real link from a brush stroke are unchanged; only the click-to-clone (and its hover ghost) is suppressed for brush sources. Other shapes keep the spawn-connected-node behaviour.
