---
"@oh-just-another/state": minor
"@oh-just-another/react-ui": minor
---

Add scene text search, a stats/dimensions overlay, and zen mode.

- `state`: `searchScene(scene, query)` / `elementSearchText(element)` — a pure, case-insensitive substring index over text shapes, frame names, and edge labels; plus `Editor.selectLink(id)` to programmatically select a single connector.
- `react-ui`: `<SearchOverlay>` (⌘F) finds and frames matching text with next/prev navigation; `<StatsPanel>` (⌥/) shows the selection's x/y/w/h/angle and scene totals; `<ZenModeProvider>` / `useZenMode` (⌥Z, Esc to exit) hides chrome for focused work. All three are wired into `<Editor>` from `@oh-just-another/editor`.
