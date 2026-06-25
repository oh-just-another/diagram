---
"@oh-just-another/state": minor
---

Increase / decrease the font size of the selected text with `Cmd/Ctrl+Shift+>` and `Cmd/Ctrl+Shift+<`. Each shape steps by a gentle ~10 % (at least 1 px) from its own size, so a mixed selection keeps its relative sizing, clamped to the usable range. New engine API: `Editor.adjustSelectionFontSize(direction)`.
