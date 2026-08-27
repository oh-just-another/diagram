---
"@oh-just-another/react-ui": minor
"@oh-just-another/editor": minor
---

Canvas context menu (right-click on empty canvas): Paste, Unlock all, Add text / Add sticky note / Add comment, Set start view / Set current view as start, check rows for Show grid, Snap to grid, Snap objects, Show object size, Suggest object size, a "Mouse or trackpad" radio submenu, and Show all. `ContextMenuItem` actions gain `checked` (rendered as a leading check mark, `role="menuitemcheckbox"`). `<Diagram persistPreferences>` keeps `EditorPreferences` in `localStorage` (`bindPreferencesPersistence` / `loadPreferences` exported for hand-composed shells).
