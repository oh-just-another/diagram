---
"@oh-just-another/react-ui": patch
"@oh-just-another/editor": patch
---

Crisp glyphs: icon presets moved to pixel-aligned lucide sizes — `CONTROL_ICON` 24 / 2 (the native grid, 2-px strokes), `ROW_ICON` and `MARK_ICON` 16 / 1.5 (1-px strokes), `BADGE_ICON` 12 / 2; `--du-icon-size` is 24. The vertical tool dock now sits on a whole-pixel offset (`top: round(50%, 1px); translate: 0 round(-50%, 1px)` on the new `.du-dock` wrapper) instead of a `translateY(-50%)` that landed on half pixels whenever the free space was odd and blurred every glyph in the dock.
