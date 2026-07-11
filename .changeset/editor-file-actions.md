---
"@oh-just-another/editor": minor
---

Add editor file operations as registry actions + hotkeys: Save as JSON (`⌘S`), Open… (`⌘O`), Export PNG (`⌘⇧E`) and Copy as image to the system clipboard (`⇧⌥C`, PNG blob via the async Clipboard API). Exposed via `registerFileActions()` / `fileActions` and the `downloadScene` / `openSceneFile` / `downloadPng` / `downloadSvg` / `copySceneAsImage` helpers (`setFileActionNotifier` routes errors to a host toast). `<Editor>` registers them on mount and adds a "Copy as image" File-menu item with shortcut hints. All built on the existing serialization + exporter pipelines.
