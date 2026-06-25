---
"@oh-just-another/react-ui": patch
"@oh-just-another/diagram": patch
---

Fix the context menu (and any chrome reading the legacy `--menu-*` / `--panel` /
`--text` aliases) ignoring an explicit app theme. The aliases forward to the
`--du-*` theme variables via `var()`, but were declared only on `:root` — and a
`var()` inside a custom property resolves on the element where it's declared. So
under an OS dark preference the alias baked in `:root`'s dark value and inherited
that frozen colour straight past a `[data-theme="light"]` override, leaving a
dark menu on a light app. The aliases are now declared at every theme scope
(`:root`, `[data-theme="light"]`, `[data-theme="dark"]`) so each re-resolves
against the scoped `--du-*`.
