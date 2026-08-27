---
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
---

Switch type now covers the full matrix: shape kinds (rectangle / ellipse / diamond) ↔ text ↔ sticky, any to any, bulk on multi-selection. The user text transplants between carriers (`TextElement.text` ↔ embedded `label`); converting INTO a sticky snaps the fill to the nearest colour of the new `STICKY_PALETTE` (a text's font colour never becomes the card colour); converting FROM a sticky drops its reactions / tags / author. The toolbar's type control gained Text and Sticky targets and now also appears for text and sticky selections.
