---
"@oh-just-another/state": minor
---

`Editor.updateTextStyle(ids, partial)` merges a text style into text elements' own style and into labelable shapes' label style (seeding the label) in one undo step, and `Editor.updateTextProps` now routes `fontFamily` / `fontSize` to labels as well (an explicit size leaves auto-fit), so a mixed text + shape selection can be styled through one call.
