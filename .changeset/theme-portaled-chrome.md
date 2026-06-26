---
"@oh-just-another/editor": patch
"@oh-just-another/react-ui": patch
---

Fix floating chrome ignoring the app theme. The selection / property panel,
popovers, tooltips and the right-click context menu portal out of the editor
root, which also escaped the `data-theme` set there — so under an OS dark
preference they showed a dark surface even when the app was set to light (and
vice-versa). They now portal into a wrapper that mirrors the editor's theme, so
they always match the app. The context menu additionally portals into that
wrapper and its colours forward to the `--du-*` theme variables (no more
hard-coded dark fallbacks / hover).
