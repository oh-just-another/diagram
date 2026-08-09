---
"@oh-just-another/state": patch
---

A right-click / touch long-press now routes the selection before `onLongPress` listeners fire: on empty canvas it clears the selection (the menu is the canvas menu), on an unselected element or link it selects that one, and on a selected element it keeps the current selection.
