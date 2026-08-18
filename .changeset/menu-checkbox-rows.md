---
"@oh-just-another/react-ui": patch
"@oh-just-another/editor": patch
---

`MainMenu.Item` gains `checked` — the row renders as `menuitemcheckbox` with a decorative trailing switch instead of nesting a `Switch` button inside the row button (invalid HTML, React warned on every open). `Switch` gains `presentational` for the same purpose.
