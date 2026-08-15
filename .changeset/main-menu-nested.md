---
"@oh-just-another/editor": minor
---

The main menu is compact and nested: Board › (Open, Save as JSON, Copy as image, Export ›, Start view, Set current view as start, Reset canvas), Edit › (Undo/Redo, Cut/Copy/Paste, Select all, Delete, Commands ⌘K, Find ⌘F), View › (Grid › None / Line grid / Dot grid + Snap to grid switch, Object dimensions, Minimap, Theme ›, Enter full screen), Preferences › (Mouse or trackpad ›, Snap objects, Suggest object size), with Hotkeys and GitHub as top-level rows. Zoom entries moved out (the zoom menu has them); segmented toggles became radio rows and switches. New `<Diagram renderBoardMenuExtras>` slot renders host rows inside Board › (the playground's Import / Export formats live there now).
