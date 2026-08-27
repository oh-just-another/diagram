---
"@oh-just-another/state": minor
"@oh-just-another/scene": minor
"@oh-just-another/serialization": minor
---

Canvas-menu backing APIs. `Editor.preferences` / `setPreferences` (`snapObjects`, `showObjectSize`, `suggestObjectSize`, `wheelMode`) seeded via `EditorOptions.preferences`; `wheelMode` (`auto` / `mouse` / `trackpad`) routes plain wheel events to zoom or pan. `Editor.unlockAll()`, `Editor.createStickyAt(point)`. Saved start view: `Viewport.startView` (exported with the scene, applied when a document loads), `Editor.setCurrentViewAsStart()` / `goToStartView()` / `clearStartView()` / `startView`.
