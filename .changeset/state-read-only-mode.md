---
"@oh-just-another/state": minor
---

Add read-only / view mode. `EditorOptions.readOnly`, `editor.readOnly`, `editor.setReadOnly()` and `editor.toggleReadOnly()` gate every scene-mutating pointer path (create / move / resize / rotate / annotation / edge edits) at the `applyEmit` choke point and in the pointer-down handlers, while pan / zoom / click + marquee select stay live. The action registry now honours each action's `viewMode` flag — in read-only only `viewMode` actions dispatch (zoom, pan, grid, select-all, cancel, and the new `toggle-read-only` action bound to `⌥R`).
