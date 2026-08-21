---
"@oh-just-another/react-ui": minor
"@oh-just-another/editor": patch
---

Every chrome control is now 40px — grouped toolbar buttons, the selection floating panel, panel headers, dialog and sidebar buttons — matching the menu row height (`--du-button-size-sm` is an alias of `--du-control-size`). Glyphs scale with them through shared icon presets exported from `@oh-just-another/react-ui`: `CONTROL_ICON` (20px, inside controls), `ROW_ICON` (16px, menu / list rows), `MARK_ICON` (14px checks / chevrons), `BADGE_ICON` (12px chips). Inputs grow to 36px, small inline controls to 28px, colour swatches to 32px, help-dialog key pills to 24px.
