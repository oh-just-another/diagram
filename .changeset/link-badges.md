---
"@oh-just-another/react-ui": minor
"@oh-just-another/editor": patch
---

Elements carrying a safe `href` now show a persistent link badge at their top-right corner (new `LinkBadges` overlay, mounted by the editor shell). Clicking the badge opens the link; the hover popup and Cmd/Ctrl-click behaviour are unchanged. Badges track pan/zoom and also render in read-only mode.
